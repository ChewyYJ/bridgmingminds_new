import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Modal, Platform, Pressable, ScrollView, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { validateRoomPlacements, type RoomCategory, type RoomPlacement, type RoomSummary } from '../../shared/room.mjs';
import { C, T, ErrorNote, Icon } from '../components/ui';
import { ApiError, isDraftOwner } from '../lib/api';
import { useApp } from '../lib/state';
import { Action, LoadState, errorMessage, requestId } from '../role3/common';
import { AvatarPanelHeader } from '../role3/AvatarPanelHeader';
import { CoinIcon } from '../role3/CoinIcon';
import { roomApi } from './api';
import { RoomCanvas, type RoomCanvasHandle } from './RoomCanvas';
import { RoomItemArt } from './RoomItemArt';
import { RoomDragHandle } from './RoomDragHandle';
import { readRoomDraft, writeRoomDraft, type RoomDraft } from './draft';
import { ROOM_ASPECT_RATIO } from './geometry';

type Props = { onEditingChange?: (value: boolean) => void; onOpenAvatar?: () => void; onOpenSettings?: () => void };
const categories: { id: RoomCategory; label: string }[] = [
  { id: 'seating', label: 'Seating' }, { id: 'tables', label: 'Tables' }, { id: 'storage', label: 'Storage' }, { id: 'decor', label: 'Decor' },
];
function sameLayout(a: RoomPlacement[], b: RoomPlacement[]) {
  return JSON.stringify([...a].sort((x,y) => x.itemId.localeCompare(y.itemId))) === JSON.stringify([...b].sort((x,y) => x.itemId.localeCompare(y.itemId)));
}
export function RoomScreen(props: Props) {
  const { state } = useApp();
  const owner = state?.profile.id ?? 'guest';
  return <OwnedRoomScreen key={owner} {...props} owner={owner} />;
}
function OwnedRoomScreen({ owner, onEditingChange, onOpenAvatar, onOpenSettings }: Props & { owner: string }) {
  const { refresh } = useApp();
  const windowSize = useWindowDimensions();
  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [draft, setDraft] = useState<RoomDraft | null>(null);
  const [mode, setMode] = useState<'view' | 'edit' | 'shop'>('view');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [status, setStatus] = useState('Drag furniture into your room.');
  const [category, setCategory] = useState<RoomCategory>('seating');
  const [shopCategory, setShopCategory] = useState<RoomCategory | 'all'>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [stageWidth, setStageWidth] = useState(350);
  const measureStage = useCallback((event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width > 0) setStageWidth(Math.min(width, 620));
  }, []);
  const [operation, setOperation] = useState<'save' | 'purchase' | null>(null);
  const [confirmation, setConfirmation] = useState<{ itemId: string; requestId: string } | null>(null);
  const [leave, setLeave] = useState<{ action: () => void } | null>(null);
  const canvas = useRef<RoomCanvasHandle>(null);
  const mounted = useRef(true);
  const lock = useRef(false);
  const generation = useRef(0);
  const editing = mode === 'edit'; const busy = operation !== null;
  const placements = editing && draft ? draft.placements : room?.placements ?? [];
  const dirty = !!room && !!draft && !sameLayout(room.placements, draft.placements);
  const currentOwner = useCallback(() => mounted.current && isDraftOwner(owner), [owner]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const load = useCallback(async () => {
    const sequence = ++generation.current;
    try {
      const [next, local] = await Promise.all([roomApi.summary(), readRoomDraft(owner).catch(() => null)]);
      if (!currentOwner() || sequence !== generation.current) return;
      setRoom(next);
      if (local && validateRoomPlacements(local.placements, next.ownedItemIds).valid && !sameLayout(local.placements, next.placements)) {
        setDraft(local); setMode('edit'); setNotice('Your unfinished arrangement is ready to continue.');
      }
    } catch (cause) { if (currentOwner() && sequence === generation.current) setError(errorMessage(cause)); }
    finally { if (currentOwner() && sequence === generation.current) setLoading(false); }
  }, [owner, currentOwner]);
  // Loading starts true; load only updates state after the external requests settle.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { onEditingChange?.(editing); return () => onEditingChange?.(false); }, [editing, onEditingChange]);
  useEffect(() => {
    if (!editing) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (lock.current) return true;
      if (dirty) setLeave({ action: () => setMode('view') });
      else { setDraft(null); setMode('view'); }
      return true;
    });
    return () => subscription.remove();
  }, [editing, dirty]);
  useEffect(() => {
    if (Platform.OS !== 'web' || !dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
  function persist(next: RoomDraft | null) {
    void writeRoomDraft(owner, next).catch(() => { if (currentOwner()) setNotice('Keep this page open until you save; the local draft could not be stored.'); });
  }
  function change(next: RoomPlacement[]) {
    if (!room || busy) return;
    const checked = validateRoomPlacements(next, room.ownedItemIds);
    if (!checked.valid) { setStatus(checked.error); return; }
    const nextDraft = { version: draft?.version ?? room.version, placements: checked.placements };
    setDraft(nextDraft); persist(nextDraft); setError(''); setNotice('');
  }
  function edit() {
    if (!room) return;
    setDraft({ version: room.version, placements: room.placements.map(p => ({ ...p })) });
    setMode('edit'); setError(''); setNotice(''); setSelected(null); setStatus('Drag furniture into your room.');
  }
  function requestLeave(action: () => void) {
    if (busy) return;
    canvas.current?.end(true);
    if (dirty) setLeave({ action });
    else { setDraft(null); persist(null); action(); }
  }
  function discard() {
    const action = leave?.action;
    setLeave(null); setDraft(null); persist(null); setError(''); setNotice('Changes discarded.'); setMode('view'); action?.();
  }
  async function save() {
    if (!room || !draft || lock.current || dragging) return;
    lock.current = true; setOperation('save'); setError('');
    const snapshot = draft; generation.current++;
    try {
      const next = await roomApi.save(snapshot.version, snapshot.placements);
      if (!currentOwner()) return;
      setRoom(next); setDraft(null); persist(null); setMode('view'); setNotice('Your room is saved.');
    } catch (cause) {
      if (!currentOwner()) return;
      if (cause instanceof ApiError && cause.status === 409) {
        try {
          const latest = await roomApi.summary();
          if (!currentOwner()) return;
          setRoom(latest); const retained = { ...snapshot, version: latest.version }; setDraft(retained); persist(retained);
          setError('Your room changed elsewhere. Your arrangement is still here. Review it, then save again.');
        } catch { if (currentOwner()) setError('Your arrangement is safe here. The latest room could not be loaded; please try saving again.'); }
      } else setError(errorMessage(cause));
    } finally { lock.current = false; if (currentOwner()) setOperation(null); }
  }
  async function purchase() {
    if (!room || !confirmation || lock.current) return;
    const item = room.catalog.find(entry => entry.id === confirmation.itemId);
    if (!item || item.price === null || room.coins < item.price || room.ownedItemIds.includes(item.id)) return;
    lock.current = true; setOperation('purchase'); setError(''); generation.current++;
    try {
      const receipt = await roomApi.purchase(item.id, confirmation.requestId);
      if (!currentOwner()) return;
      setRoom(receipt.room); setConfirmation(null); setNotice(`${item.name} is in your collection. Decorate your room to place it.`);
      void refresh().catch(() => undefined);
    } catch (cause) { if (currentOwner()) setError(errorMessage(cause)); }
    finally { lock.current = false; if (currentOwner()) setOperation(null); }
  }
  function rotate() {
    const placement = placements.find(p => p.itemId === selected);
    if (!placement || !room) return;
    const rotated = { ...placement, rotation: (placement.rotation === 0 ? 1 : 0) as 0 | 1 };
    const next = placements.map(p => p.itemId === selected ? rotated : p);
    const validation = validateRoomPlacements(next, room.ownedItemIds);
    if (!validation.valid) { setStatus('There isn’t room to rotate here. Drag the item to a clear space first.'); return; }
    change(next); setStatus('Rotated.');
  }
  const header = <><AvatarPanelHeader title="My Space" subtitle="A little place of your own" onSettings={onOpenSettings ? () => requestLeave(onOpenSettings) : undefined} />
    <View style={{ flexDirection: 'row', backgroundColor: C.sage, borderRadius: 13, padding: 4, gap: 4 }}>
      <Action label="Avatar" onPress={() => onOpenAvatar && requestLeave(onOpenAvatar)} style={{ flex: 1, borderWidth: 0 }} />
      <Action label="Room" selected primary onPress={() => {}} style={{ flex: 1 }} />
    </View></>;
  if (!room) return <View testID="room-screen" onLayout={measureStage} style={{ width: '100%', minWidth: 0, maxWidth: 620, alignSelf: 'center', gap: 12 }}>{header}<LoadState loading={loading} error={error} onRetry={() => { setLoading(true); setError(''); void load(); }} /></View>;
  const selectedItem = room.catalog.find(item => item.id === selected);
  const selectedPlacement = placements.find(p => p.itemId === selected);
  const tray = room.catalog.filter(item => room.ownedItemIds.includes(item.id) && item.category === category);
  const chosen = room.catalog.find(item => item.id === confirmation?.itemId);
  const canvasWidth = editing ? Math.min(stageWidth - 20, Math.max(190, (windowSize.height - 450 - (error ? 60 : 0) - (notice ? 25 : 0)) / ROOM_ASPECT_RATIO)) : stageWidth;
  const canvasHeight = canvasWidth * ROOM_ASPECT_RATIO;
  return <View testID="room-screen" onLayout={measureStage}
    style={{ width: '100%', minWidth: 0, maxWidth: 620, alignSelf: 'center', gap: editing ? 5 : 13, ...(editing ? { flex: 1, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10 } : {}) }}>
    {editing ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Action label="Cancel" testID="cancel-room-edit" onPress={() => requestLeave(() => setMode('view'))} disabled={busy} style={{ paddingHorizontal: 11 }} />
      <Text accessibilityRole="header" style={[T.h2, { flex: 1, textAlign: 'center', fontSize: 22 }]}>Decorate</Text>
      <Text testID="room-draft-status" style={[T.small, { color: dirty ? '#8A5F37' : C.muted }]}>{dirty ? 'Unsaved' : 'No changes'}</Text>
    </View> : header}
    {mode !== 'shop' ? <>
      {!editing && <View style={{ gap: 3 }}><Text style={T.h2}>My room</Text><Text style={T.small}>A quiet corner, made yours.</Text></View>}
      <View style={{ alignItems: 'center' }}><RoomCanvas ref={canvas} width={canvasWidth} height={canvasHeight}
        items={room.catalog} ownedItemIds={room.ownedItemIds} placements={placements} editing={editing} disabled={busy} selected={selected}
        onSelect={setSelected} onChange={change} onDragChange={setDragging} onStatus={setStatus} /></View>
      {editing ? <>
        <View style={{ gap: 1 }}><Text style={[T.h3, { fontSize: 14, lineHeight: 20 }]}>{selectedItem ? `${selectedItem.name} · Owned` : 'Arrange your favourites'}</Text>
          <Text testID="room-placement-status" accessibilityLiveRegion="polite" numberOfLines={1} style={[T.small, { fontSize: 11, lineHeight: 17 }]}>{status}</Text></View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Action label="Rotate" icon="rotate-cw" testID="rotate-room-item" disabled={!selectedPlacement || busy || dragging} onPress={rotate} style={{ flex: 1, minHeight: 42, paddingVertical: 8 }} />
          <Action label="Put away" icon="archive" testID="put-away-room-item" disabled={!selectedPlacement || busy || dragging} onPress={() => { change(placements.filter(p => p.itemId !== selected)); setStatus('Put away. Drag it from your collection to place it again.'); }} style={{ flex: 1, minHeight: 42, paddingVertical: 8 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }}>{categories.map(entry => <CategoryButton key={entry.id} label={entry.label} selected={category === entry.id} disabled={busy || dragging} onPress={() => setCategory(entry.id)} />)}</View>
        <ScrollView accessibilityLabel="Your furniture" horizontal scrollEnabled={!dragging} showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, minHeight: 108, maxHeight: 112 }} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
          {tray.length ? tray.map(item => {
            const placed = placements.some(p => p.itemId === item.id);
            return <RoomDragHandle key={item.id} tray testID={`room-tray-${item.id}`} label={`${item.name}, ${placed ? 'placed' : 'owned'}`} enabled={!busy} selected={selected === item.id}
              onSelect={() => setSelected(item.id)} onStart={point => canvas.current?.start(item.id, point, true)} onMove={point => canvas.current?.move(point)} onEnd={cancelled => canvas.current?.end(cancelled)}
              style={{ width: 100, borderWidth: 1, borderColor: selected === item.id ? '#927653' : C.border, backgroundColor: C.paper, borderRadius: 12, padding: 5, alignItems: 'center', gap: 2 }}>
              <View pointerEvents="none"><RoomItemArt itemId={item.id} width={78} height={58} rotation={0} /></View>
              <Text numberOfLines={1} style={[T.small, { color: C.ink, fontSize: 12, lineHeight: 16 }]}>{item.name}</Text><Text style={[T.small, { fontSize: 10, lineHeight: 14 }]}>{placed ? 'Placed' : 'Drag to place'}</Text>
            </RoomDragHandle>;
          }) : <Text style={[T.small, { padding: 16 }]}>Your collection has no {category} yet.</Text>}
        </ScrollView>
        {error ? <ErrorNote message={error} /> : null}
        {notice ? <Text style={[T.small, { fontSize: 12 }]}>{notice}</Text> : null}
        <View style={{ marginTop: 'auto', gap: 4 }}><Action label="Save room" primary testID="save-room" onPress={() => void save()} disabled={dragging} busy={operation === 'save'} /><Text style={[T.small, { textAlign: 'center', fontSize: 11 }]}>Saves your layout. No Coins spent.</Text></View>
      </> : <>
        {notice ? <Text testID="room-notice" accessibilityLiveRegion="polite" style={T.small}>{notice}</Text> : null}
        <Action label="Decorate room" primary testID="decorate-room" onPress={edit} />
        <Entry title="Furniture shop" subtitle="Find your next favourite" icon="shopping-bag" onPress={() => { setMode('shop'); setError(''); setNotice(''); }} />
        <Entry title="Your collection" subtitle={`${room.ownedItemIds.length} items · starter furniture included`} icon="archive" onPress={edit} />
      </>}
    </> : <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Action label="My room" icon="arrow-left" onPress={() => { setMode('view'); setConfirmation(null); setError(''); }} disabled={busy} /><Text style={[T.h2, { flex: 1, fontSize: 22 }]}>Furniture shop</Text></View>
      <Text style={T.small}>A little detail for your room.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5 }}>
        {[{ id: 'all' as const, label: 'All' }, ...categories].map(entry => <CategoryButton key={entry.id} label={entry.label} selected={shopCategory === entry.id} disabled={busy} onPress={() => setShopCategory(entry.id)} />)}
      </ScrollView>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '3%' }}>{room.catalog.filter(item => !item.starter && (shopCategory === 'all' || item.category === shopCategory)).map(item => {
        const owned = room.ownedItemIds.includes(item.id);
        return <Pressable key={item.id} testID={`room-shop-${item.id}`} accessibilityRole="button" accessibilityLabel={`${item.name}, ${owned ? 'owned' : `${item.price} Coins`}`}
          accessibilityState={{ disabled: owned || busy, selected: chosen?.id === item.id }} {...(Platform.OS === 'web' ? { 'aria-pressed': chosen?.id === item.id } : {})}
          disabled={owned || busy} onPress={() => { setConfirmation({ itemId: item.id, requestId: requestId() }); setError(''); setNotice(''); }}
          style={{ width: '31.3%', borderWidth: 1, borderColor: chosen?.id === item.id ? '#927653' : C.border, borderRadius: 13, padding: 7, marginBottom: 10, alignItems: 'center', gap: 4, backgroundColor: C.paper }}>
          <RoomItemArt itemId={item.id} width={Math.max(64, stageWidth / 3 - 28)} height={90} rotation={0} />
          <Text numberOfLines={2} style={[T.small, { color: C.ink, textAlign: 'center', fontSize: 12, minHeight: 30 }]}>{item.name}</Text>
          <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>{owned ? <Icon name="check" size={14} color={C.muted} /> : <CoinIcon size={14} />}<Text style={[T.small, { fontSize: 12 }]}>{owned ? 'Owned' : item.price}</Text></View>
        </Pressable>;
      })}</View>
      {notice ? <Text testID="room-notice" accessibilityLiveRegion="polite" style={T.small}>{notice}</Text> : null}
    </>}
    <Modal transparent visible={!!chosen && mode === 'shop'} animationType="fade" onRequestClose={() => { if (!busy) { setConfirmation(null); setError(''); } }}>
      <View style={{ flex: 1, backgroundColor: '#29262366', justifyContent: 'center', padding: 20 }}><View testID="room-purchase-confirmation" style={{ width: '100%', maxWidth: 420, alignSelf: 'center', backgroundColor: C.paper, borderRadius: 22, padding: 22, gap: 15 }}>
        <Text accessibilityRole="header" style={T.h2}>Buy {chosen?.name}?</Text>
        {chosen && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}><RoomItemArt itemId={chosen.id} width={90} height={95} rotation={0} /><View style={{ flex: 1, gap: 8 }}><Text style={T.body}>Price: {chosen.price} Coins</Text><Text style={T.small}>{room.coins >= (chosen.price ?? 0) ? `Balance after purchase: ${room.coins - (chosen.price ?? 0)} Coins` : `Current balance: ${room.coins} Coins`}</Text></View></View>}
        <Text style={T.small}>Buying adds it to your collection. Place it later.</Text>
        {chosen && room.coins < (chosen.price ?? 0) && <Text style={T.small}>Earn {(chosen.price ?? 0) - room.coins} more Coins through learning.</Text>}
        {error ? <ErrorNote message={error} /> : null}
        <View style={{ flexDirection: 'row', gap: 8 }}><Action label="Not now" onPress={() => { setConfirmation(null); setError(''); }} disabled={busy} style={{ flex: 1 }} /><Action label={`Buy · ${chosen?.price ?? 0} Coins`} primary testID="confirm-room-purchase" busy={operation === 'purchase'} disabled={!chosen || room.coins < (chosen.price ?? 0)} onPress={() => void purchase()} style={{ flex: 1 }} /></View>
      </View></View>
    </Modal>
    <Modal transparent visible={!!leave} animationType="fade" onRequestClose={() => setLeave(null)}>
      <View style={{ flex: 1, backgroundColor: '#29262366', justifyContent: 'center', padding: 20 }}><View style={{ backgroundColor: C.paper, borderRadius: 22, padding: 22, gap: 16, maxWidth: 420, alignSelf: 'center', width: '100%' }}>
        <Text accessibilityRole="header" style={T.h2}>Discard this arrangement?</Text><Text style={T.body}>Your saved room will stay as it was.</Text>
        <Action label="Keep decorating" primary onPress={() => setLeave(null)} /><Action label="Discard changes" testID="discard-room-changes" onPress={discard} />
      </View></View>
    </Modal>
  </View>;
}
function CategoryButton({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled }} {...(Platform.OS === 'web' ? { 'aria-pressed': selected } : {})} disabled={disabled} onPress={onPress}
    style={{ minHeight: 38, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center', borderRadius: 10, flexGrow: 1, backgroundColor: selected ? C.forest : C.sage }}><Text style={[T.small, { fontSize: 12, color: selected ? 'white' : C.ink }]}>{label}</Text></Pressable>;
}
function Entry({ title, subtitle, icon, onPress }: { title: string; subtitle: string; icon: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={{ flexDirection: 'row', gap: 13, alignItems: 'center', padding: 15, borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.paper }}>
    <Icon name={icon} size={26} color="#8A745F" /><View style={{ flex: 1, gap: 3 }}><Text style={[T.h3, { fontSize: 17 }]}>{title}</Text><Text style={T.small}>{subtitle}</Text></View><Icon name="chevron-right" size={20} color={C.muted} />
  </Pressable>;
}
