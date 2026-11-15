import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import {
  C,
  T,
  Card,
  Button,
  Tag,
  Icon,
  ErrorNote,
  Resource,
} from "../components/ui";
import { GardenIsland, MeadowPlant } from "../components/GardenIsland";
import { GardenArchive } from "../components/GardenArchive";
import { PlantStudio } from "../components/PlantStudio";
import { GardenDrag, DragPoint } from "../components/GardenDrag";
import {
  AppState as CurrentAppState,
  LegacyWallet,
  ArchivedPlant,
  Doodle,
  GardenPosition,
  Plot,
} from "../types";
import { api, ApiError } from "../lib/api";
import { useGardenClock } from "../hooks/useGardenClock";
import { careRemainingMs, plantCareStatus } from "../../shared/garden-care.mjs";
import {
  DEFAULT_POSITIONS,
  isPlantablePosition,
  hasPlantSpace,
} from "../../shared/garden-layout.mjs";

// Retained solely for historical source compatibility. Active routes use avatars.
type AppState = Omit<CurrentAppState, "wallet"> & { wallet: LegacyWallet };
type PlantType = NonNullable<Plot["plantType"]>;
type Cargo = {
  kind: "seed" | "plant";
  plantType: PlantType;
  plotId?: string;
  doodle?: Doodle;
};
type Bounds = { x: number; y: number; width: number; height: number };
type Request = { path: string; body: Record<string, unknown> };
const unlocks: Record<PlantType, number> = {
  daisy: 0,
  sunflower: 30,
  lavender: 60,
  tulip: 90,
  fern: 0,
  cactus: 0,
  monstera: 30,
  bamboo: 60,
  doodle: 0,
};
const flowers: { type: PlantType; name: string; color: string }[] = [
  { type: "daisy", name: "Daisy", color: "#F3E6AF" },
  { type: "sunflower", name: "Sunflower", color: "#EFD291" },
  { type: "lavender", name: "Lavender", color: "#DFD5ED" },
  { type: "tulip", name: "Tulip", color: "#F1D2D5" },
];
const greenery: { type: PlantType; name: string; color: string }[] = [
  { type: "fern", name: "Fern", color: "#C7DBA3" },
  { type: "cactus", name: "Cactus", color: "#ADD4B9" },
  { type: "monstera", name: "Monstera", color: "#B6CF9B" },
  { type: "bamboo", name: "Bamboo", color: "#DBDEAC" },
];
const isGreenery = (type: string) =>
  greenery.some((item) => item.type === type);
const key = () =>
  `garden-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const growthNames = ["seed", "sprout", "growing", "bloom"];
const pretty = (type: string) =>
  type === "doodle"
    ? "Your doodle"
    : type.charAt(0).toUpperCase() + type.slice(1);
function timeLeft(milliseconds: number) {
  return milliseconds >= 3_600_000
    ? `${Math.ceil(milliseconds / 3_600_000)}h`
    : `${Math.max(1, Math.ceil(milliseconds / 60_000))}m`;
}
function positionOf(plot: Plot, index: number) {
  return plot.position || DEFAULT_POSITIONS[index % DEFAULT_POSITIONS.length];
}
function measure(ref: React.RefObject<View | null>): Promise<Bounds> {
  return new Promise((resolve) => {
    if (!ref.current) {
      resolve({ x: 0, y: 0, width: 0, height: 0 });
      return;
    }
    ref.current.measureInWindow((x, y, width, height) =>
      resolve({ x, y, width, height }),
    );
  });
}

function PlantCategories({
  value,
  onChange,
}: {
  value: "greenery" | "flowers";
  onChange: (value: "greenery" | "flowers") => void;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {(["greenery", "flowers"] as const).map((item) => (
        <Pressable
          key={item}
          accessibilityRole="button"
          accessibilityLabel={item === "greenery" ? "Greenery" : "Flowers"}
          accessibilityState={{ selected: item === value }}
          aria-pressed={item === value}
          onPress={() => onChange(item)}
          style={{
            flex: 1,
            minHeight: 44,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 10,
            backgroundColor: item === value ? C.forest : "#ECEEDF",
          }}
        >
          <Text
            style={[
              T.small,
              {
                fontFamily: "DMMedium",
                color: item === value ? "#FFFFFF" : C.forest,
              },
            ]}
          >
            {item === "greenery" ? "Greenery" : "Flowers"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Garden({
  state,
  refresh,
  startPractice,
  onInteractionChange,
}: {
  state: AppState;
  refresh: () => Promise<void>;
  startPractice: () => void;
  onInteractionChange?: (active: boolean) => void;
}) {
  const { width } = useWindowDimensions();
  const [snapshot, setSnapshot] = useState<{
    data: AppState;
    base: AppState;
  } | null>(null);
  // A mutation response bridges a failed refresh, but must not hide a later
  // successful refresh (including care performed on another device).
  const data = snapshot?.base === state ? snapshot.data : state;
  const now = useGardenClock();
  const [showArchive, setShowArchive] = useState(false);
  const [selected, setSelected] = useState(state.plots[0]?.id || "plot-1");
  const [plant, setPlant] = useState<PlantType>("fern");
  const [studio, setStudio] = useState<"plants" | "drawing">("plants");
  const [category, setCategory] = useState<"greenery" | "flowers">("greenery");
  const plants = category === "greenery" ? greenery : flowers;
  const [drawing, setDrawing] = useState<Doodle>({ strokes: [] });
  const [armed, setArmed] = useState(false);
  const [placement, setPlacement] = useState<GardenPosition | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Request | null>(null);
  const pendingRef = useRef<Request | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [boardWidth, setBoardWidth] = useState(600);
  const rootRef = useRef<View>(null);
  const boardRef = useRef<View>(null);
  const dragRef = useRef<{
    cargo: Cargo;
    root?: Bounds;
    board?: Bounds;
    point: DragPoint;
  } | null>(null);
  const [drag, setDrag] = useState<{
    cargo: Cargo;
    x: number;
    y: number;
    position?: GardenPosition;
    valid: boolean;
  } | null>(null);
  const lock = useRef(false);
  useEffect(
    () => () => {
      dragRef.current = null;
      onInteractionChange?.(false);
    },
    [onInteractionChange],
  );
  const plot = data.plots.find((p) => p.id === selected);
  const care = plot ? plantCareStatus(plot, now) : "empty";
  const planted = data.plots.filter((p) => p.plantType);
  const nextUnlock = [30, 60, 90].find((threshold) => threshold > data.xp);
  const nextPlants = [...greenery, ...flowers].filter(
    (item) => unlocks[item.type] === nextUnlock,
  );
  const firstEmpty = data.plots.find((p) => !p.plantType);
  const chosen = studio === "drawing" ? "doodle" : plant;
  const drawingReady = drawing.strokes.some(
    (stroke) => stroke.points.length >= 2,
  );
  const available = data.wallet.seeds > 0 && !!firstEmpty;
  const canPlant =
    available &&
    data.xp >= unlocks[chosen] &&
    (chosen !== "doodle" || drawingReady);
  const disabled = busy || !!pending;
  const wide = width >= 1100;
  const boardHeight = boardWidth * 0.76;
  const plantSize = Math.max(46, Math.min(92, boardWidth * 0.12));
  const draggedPlant = data.plots.find(
    (item) => item.id === drag?.cargo.plotId,
  );

  async function mutate(request: Request, success: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    pendingRef.current = request;
    setPending(request);
    try {
      const next = await api<AppState>(request.path, {
        method: "POST",
        body: request.body,
      });
      setSnapshot({ data: next, base: state });
      pendingRef.current = null;
      setPending(null);
      setArmed(false);
      setNotice(success);
      try {
        await refresh();
        setSnapshot(null);
      } catch {
        /* Keep the authoritative mutation response until reconnected. */
      }
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) {
        pendingRef.current = null;
        setPending(null);
      }
      setError(
        e instanceof Error
          ? e.message
          : "Your garden could not be reached. Try again.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function plantAt(cargo: Cargo, position: GardenPosition, target?: Plot) {
    const empty =
      target && !target.plantType
        ? target
        : plot && !plot.plantType
          ? plot
          : firstEmpty;
    if (!empty || data.wallet.seeds < 1 || data.xp < unlocks[cargo.plantType]) {
      setNotice(
        !empty
          ? "Clear or archive a plant to make room."
          : "Practise to earn seeds and unlock plants.",
      );
      return;
    }
    if (cargo.plantType === "doodle" && !cargo.doodle?.strokes.length) {
      setNotice("Draw something first.");
      return;
    }
    setSelected(empty.id);
    setPlacement(null);
    void mutate(
      {
        path: "/garden/plant",
        body: {
          plotId: empty.id,
          plantType: cargo.plantType,
          position,
          ...(cargo.doodle ? { doodle: cargo.doodle } : {}),
          idempotencyKey: key(),
        },
      },
      `${pretty(cargo.plantType)} planted.`,
    );
  }
  function drop(cargo: Cargo, position: GardenPosition) {
    if (lock.current || pendingRef.current) return;
    if (!isPlantablePosition(position)) {
      setNotice("Drop onto the grass. No seed used.");
      return;
    }
    if (!hasPlantSpace(data.plots, position, cargo.plotId)) {
      setNotice("Choose an open spot between plants.");
      return;
    }
    if (cargo.kind === "plant") {
      setSelected(cargo.plotId!);
      void mutate(
        {
          path: "/garden/move",
          body: {
            plotId: cargo.plotId,
            plantId: data.plots.find((item) => item.id === cargo.plotId)
              ?.plantId,
            position,
          },
        },
        "Plant moved.",
      );
    } else plantAt(cargo, position);
  }
  const cancelDrag = useCallback(() => {
    dragRef.current = null;
    setDrag(null);
    onInteractionChange?.(false);
  }, [onInteractionChange]);
  function showDrag(point: DragPoint) {
    const current = dragRef.current;
    if (!current) return;
    current.point = point;
    if (!current.root || !current.board || !current.board.width) return;
    const position = {
      x: (point.x - current.board.x) / current.board.width,
      y: (point.y - current.board.y) / current.board.height,
    };
    setDrag({
      cargo: current.cargo,
      x: point.x - current.root.x,
      y: point.y - current.root.y,
      position,
      valid:
        isPlantablePosition(position) &&
        hasPlantSpace(data.plots, position, current.cargo.plotId),
    });
  }
  async function beginDrag(cargo: Cargo, point: DragPoint) {
    if (disabled) return;
    setNotice("");
    setError("");
    setArmed(false);
    onInteractionChange?.(true);
    const current = { cargo, point } as NonNullable<typeof dragRef.current>;
    dragRef.current = current;
    const [root, board] = await Promise.all([
      measure(rootRef),
      measure(boardRef),
    ]);
    if (dragRef.current !== current) return;
    current.root = root;
    current.board = board;
    showDrag(current.point);
  }
  function finishDrag(point: DragPoint) {
    const current = dragRef.current;
    cancelDrag();
    if (current?.board?.width)
      drop(current.cargo, {
        x: (point.x - current.board.x) / current.board.width,
        y: (point.y - current.board.y) / current.board.height,
      });
  }
  function choose(type: PlantType) {
    setPlant(type);
    setArmed(true);
    setPlacement(null);
    setError("");
    if (firstEmpty) setSelected(firstEmpty.id);
    setNotice(
      `Tap a spot for ${type === "doodle" ? "your drawing" : `your ${type}`}.`,
    );
  }
  function chooseCategory(next: "greenery" | "flowers") {
    setCategory(next);
    setPlant(next === "greenery" ? "fern" : "daisy");
    setStudio("plants");
    setArmed(false);
    setPlacement(null);
  }
  function selectPlot(p: Plot, index: number) {
    setSelected(p.id);
    setError("");
    if (!p.plantType && armed && canPlant) {
      drop(
        {
          kind: "seed",
          plantType: chosen,
          ...(chosen === "doodle" ? { doodle: drawing } : {}),
        },
        positionOf(p, index),
      );
    } else {
      setArmed(false);
      setPlacement(null);
      setNotice("");
    }
  }
  function plantSelected() {
    if (!canPlant) return;
    const position =
      placement ||
      (plot && !plot.plantType
        ? positionOf(plot, data.plots.indexOf(plot))
        : null) ||
      DEFAULT_POSITIONS.find((p) => hasPlantSpace(data.plots, p));
    if (!position) {
      setArmed(true);
      setNotice("Choose an open spot.");
      return;
    }
    drop(
      {
        kind: "seed",
        plantType: chosen,
        ...(chosen === "doodle" ? { doodle: drawing } : {}),
      },
      position,
    );
  }
  function nudge(dx: number, dy: number) {
    if (!plot?.plantType) return;
    const p = positionOf(plot, data.plots.indexOf(plot));
    drop(
      { kind: "plant", plantType: plot.plantType, plotId: plot.id },
      { x: p.x + dx, y: p.y + dy },
    );
  }
  function restorePlant(archived: ArchivedPlant) {
    const target = plot && !plot.plantType ? plot : firstEmpty;
    if (!target) return;
    setSelected(target.id);
    setPlacement(null);
    void mutate(
      {
        path: "/garden/restore",
        body: {
          archiveId: archived.id,
          plotId: target.id,
          idempotencyKey: key(),
        },
      },
      "Plant returned. Care timer resumed.",
    );
  }
  function careAction(action: "water" | "archive" | "clear" | "replant") {
    if (!plot?.plantType) return;
    setPlacement(null);
    void mutate(
      {
        path: `/garden/${action}`,
        body: {
          plotId: plot.id,
          plantId: plot.plantId,
          idempotencyKey: key(),
        },
      },
      {
        water: data.profile.dailyWorkout ? "A little care, just for enjoyment. Your plant stays safe." : "Watered. Next care in 2 days.",
        archive: "Plant archived. Care paused.",
        clear: "Space cleared.",
        replant: "Replanted. A fresh start.",
      }[action],
    );
  }

  const actionFeedback = (!!error || !!notice) && (
    <View style={{ marginTop: 18, gap: 10 }}>
      <ErrorNote message={error} />
      {!!notice && (
        <View style={s.notice}>
          <Icon name="feather" size={16} />
          <Text
            accessibilityLiveRegion="polite"
            style={[T.small, { flex: 1, color: C.forest }]}
          >
            {notice}
          </Text>
        </View>
      )}
      {!!pending && !busy && (
        <Button
          label="Retry saved garden action"
          variant="secondary"
          icon="refresh-cw"
          onPress={() => void mutate(pending, "Your garden is saved.")}
        />
      )}
    </View>
  );

  return (
    <View
      ref={rootRef}
      collapsable={false}
      style={{ gap: 22, position: "relative", overflow: "visible" }}
    >
      <View style={s.headingRow}>
        <View style={{ gap: 8, flex: 1 }}>
          <Text accessibilityRole="header" style={T.title}>
            Homeland
          </Text>
        </View>
        <Tag color="#EDF0DC">
          {planted.length} / {data.plots.length} planted
        </Tag>
      </View>
      {data.profile.dailyWorkout ? <Text style={T.body}>A little space to make your own. Your plants stay safe while you take a break.</Text> : null}
      <View
        style={{
          flexDirection: "row",
          gap: 9,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <Resource value={data.wallet.seeds} label="seeds" icon="feather" />
        <Resource
          value={data.wallet.water}
          label="water"
          icon="droplet"
          color="#E4EFF0"
        />
        <Resource
          value={data.wallet.sunlight}
          label="sunlight"
          icon="sun"
          color={C.yellow}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Archive (${data.archivedPlants.length})`}
          accessibilityState={{ expanded: showArchive }}
          aria-expanded={showArchive}
          onPress={() => setShowArchive((open) => !open)}
          style={[
            s.row,
            { marginLeft: "auto", minHeight: 44, paddingHorizontal: 12 },
          ]}
        >
          <Icon name="archive" size={17} />
          <Text style={[T.small, { color: C.forest, fontFamily: "DMBold" }]}>
            Archive ({data.archivedPlants.length})
          </Text>
          <Icon name={showArchive ? "chevron-up" : "chevron-down"} size={15} />
        </Pressable>
      </View>
      <Text style={T.small}>{data.profile.dailyWorkout ? "Water and decorate whenever you like." : "Water every 2 days to keep your plants healthy."}</Text>
      {showArchive ? actionFeedback : null}
      {showArchive ? (
        <GardenArchive
          plants={data.archivedPlants}
          disabled={disabled}
          hasSpace={!!firstEmpty}
          onRestore={restorePlant}
        />
      ) : null}
      <View
        testID="garden-unlock-progress"
        style={{
          borderWidth: 1,
          borderColor: C.border,
          borderRadius: 16,
          padding: 17,
          backgroundColor: "#F4F5EA",
          gap: 9,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <Text style={[T.h3, { fontSize: 15, flexShrink: 1 }]}>
            {nextUnlock
              ? `Next: ${nextPlants.map((item) => item.name).join(" & ")}`
              : "All plants unlocked"}
          </Text>
          <Text style={[T.small, { fontFamily: "DMBold", color: C.forest }]}>
            {nextUnlock ? `${data.xp} / ${nextUnlock} XP` : `${data.xp} XP`}
          </Text>
        </View>
        {nextUnlock && (
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Garden variety unlock progress"
            aria-valuemin={0}
            aria-valuemax={nextUnlock}
            aria-valuenow={data.xp}
            aria-valuetext={`${nextUnlock - data.xp} XP until ${nextPlants.map((item) => item.name).join(" and ")} unlock.`}
            accessibilityValue={{
              min: 0,
              max: nextUnlock,
              now: data.xp,
              text: `${nextUnlock - data.xp} XP until ${nextPlants.map((item) => item.name).join(" and ")} unlock.`,
            }}
            style={{
              height: 6,
              borderRadius: 3,
              backgroundColor: "#DFE5D2",
              overflow: "hidden",
            }}
          >
            <View
              style={{
                height: "100%",
                width: `${Math.min(100, (data.xp / nextUnlock) * 100)}%`,
                backgroundColor: "#718D57",
                borderRadius: 3,
              }}
            />
          </View>
        )}
      </View>
      <View style={[s.workspace, { flexDirection: wide ? "row" : "column" }]}>
        <View style={{ flex: wide ? 1 : undefined, minWidth: 0 }}>
          {!wide && (
            <View style={{ marginTop: 12 }}>
              <PlantCategories value={category} onChange={chooseCategory} />
            </View>
          )}
          {!wide && (
            <View style={{ flexDirection: "row", gap: 7, marginTop: 14 }}>
              {plants.map((item) => {
                const locked = data.xp < unlocks[item.type];
                return (
                  <GardenDrag
                    key={item.type}
                    testID={`seed-packet-${item.type}`}
                    label={
                      locked
                        ? `${item.type}, unlocks at ${unlocks[item.type]} XP`
                        : `Choose ${item.type}`
                    }
                    disabled={disabled || locked || !available}
                    onStart={(point) =>
                      void beginDrag(
                        { kind: "seed", plantType: item.type },
                        point,
                      )
                    }
                    onMove={showDrag}
                    onDrop={finishDrag}
                    onCancel={cancelDrag}
                    onTap={() => {
                      setStudio("plants");
                      choose(item.type);
                    }}
                    style={{
                      flex: 1,
                      backgroundColor: "#F2F1E5",
                      alignItems: "center",
                      padding: 7,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: plant === item.type ? "#A8B58C" : "#E5E5D8",
                      opacity: locked ? 0.48 : 1,
                    }}
                  >
                    <View pointerEvents="none" style={{ alignItems: "center" }}>
                      <MeadowPlant type={item.type} growth={3} size={45} />
                      <Text
                        style={[T.small, { fontSize: 11, color: C.forest }]}
                      >
                        {item.name}
                      </Text>
                      <Text style={[T.small, { fontSize: 9 }]}>
                        {locked ? `${unlocks[item.type]} XP` : "1 seed"}
                      </Text>
                    </View>
                  </GardenDrag>
                );
              })}
            </View>
          )}
          {!wide && drawingReady && (
            <GardenDrag
              label="Drag your drawing from the meadow tray"
              disabled={disabled || !available}
              onStart={(point) =>
                void beginDrag(
                  {
                    kind: "seed",
                    plantType: "doodle",
                    doodle: drawing,
                  },
                  point,
                )
              }
              onMove={showDrag}
              onDrop={finishDrag}
              onCancel={cancelDrag}
              onTap={() => {
                setStudio("drawing");
                choose("doodle");
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                marginTop: 10,
                padding: 6,
                backgroundColor: C.sage,
                borderRadius: 12,
              }}
            >
              <View pointerEvents="none" style={s.row}>
                <MeadowPlant
                  type="doodle"
                  growth={3}
                  doodle={drawing}
                  size={48}
                />
                <Text style={T.small}>Drag to plant</Text>
                <Icon name="move" size={16} />
              </View>
            </GardenDrag>
          )}
          <View
            ref={boardRef}
            collapsable={false}
            testID="garden-canvas"
            onLayout={(event) => setBoardWidth(event.nativeEvent.layout.width)}
            style={{
              height: boardHeight,
              width: "100%",
              position: "relative",
              overflow: "visible",
            }}
          >
            <GardenIsland
              width="100%"
              height="100%"
              decorations={data.decorations}
            />
            <Pressable
              testID="garden-ground"
              accessible={false}
              disabled={disabled}
              onPress={(event) => {
                const position = {
                  x: event.nativeEvent.locationX / boardWidth,
                  y: event.nativeEvent.locationY / boardHeight,
                };
                if (!isPlantablePosition(position)) {
                  if (armed)
                    setNotice("Choose the grassy part of your island.");
                  return;
                }
                if (!hasPlantSpace(data.plots, position)) {
                  setNotice("Choose an open spot between plants.");
                  return;
                }
                if (armed && canPlant)
                  drop(
                    {
                      kind: "seed",
                      plantType: chosen,
                      ...(chosen === "doodle" ? { doodle: drawing } : {}),
                    },
                    position,
                  );
                else {
                  setPlacement(position);
                  if (firstEmpty) setSelected(firstEmpty.id);
                  setNotice("Choose a plant or drawing, then tap Plant.");
                }
              }}
              style={StyleSheet.absoluteFill}
            />
            {data.plots
              .map((p, index) => ({ p, index, pos: positionOf(p, index) }))
              .sort((a, b) => a.pos.y - b.pos.y)
              .map(({ p, index, pos }) =>
                p.plantType ? (
                  <GardenDrag
                    key={p.id}
                    testID={`garden-plant-${p.id}`}
                    label={`Plot ${index + 1}, ${p.plantType}, ${plantCareStatus(p, now) === "dead" ? "dead" : p.growth === 3 && isGreenery(p.plantType) ? "mature" : growthNames[p.growth]}${plantCareStatus(p, now) === "thirsty" ? ", needs water" : ""}`}
                    disabled={disabled}
                    onStart={(point) =>
                      void beginDrag(
                        {
                          kind: "plant",
                          plantType: p.plantType!,
                          plotId: p.id,
                          doodle: p.doodle,
                        },
                        point,
                      )
                    }
                    onMove={showDrag}
                    onDrop={finishDrag}
                    onCancel={cancelDrag}
                    onTap={() => selectPlot(p, index)}
                    style={{
                      position: "absolute",
                      width: plantSize,
                      height: plantSize,
                      left: pos.x * boardWidth - plantSize / 2,
                      top: pos.y * boardHeight - plantSize * 0.94,
                      zIndex: 2 + Math.round(pos.y * 100),
                      opacity: drag?.cargo.plotId === p.id ? 0.25 : 1,
                    }}
                  >
                    <View pointerEvents="none" style={{ alignItems: "center" }}>
                      {selected === p.id && (
                        <View
                          style={{
                            position: "absolute",
                            bottom: 0,
                            width: plantSize * 0.72,
                            height: plantSize * 0.23,
                            backgroundColor: "#FFFCE598",
                            borderWidth: 1.5,
                            borderColor: "#FFF9DA",
                            borderRadius: 80,
                          }}
                        />
                      )}
                      <MeadowPlant
                        type={p.plantType}
                        growth={p.growth}
                        doodle={p.doodle}
                        size={plantSize}
                        dead={plantCareStatus(p, now) === "dead"}
                        animate
                        motionKey={`${p.plantId || p.id}:${p.growth}:${p.lastWateredAt || ""}`}
                      />
                      {plantCareStatus(p, now) === "thirsty" ? (
                        <View
                          style={{
                            position: "absolute",
                            right: 2,
                            top: 2,
                            backgroundColor: "#FFF8E6",
                            borderRadius: 12,
                            padding: 4,
                          }}
                        >
                          <Icon name="droplet" size={15} color="#946022" />
                        </View>
                      ) : null}
                    </View>
                  </GardenDrag>
                ) : (
                  <Pressable
                    key={p.id}
                    testID={`garden-${p.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Plot ${index + 1}, empty`}
                    disabled={disabled}
                    onPress={() => selectPlot(p, index)}
                    style={{
                      position: "absolute",
                      left: pos.x * boardWidth - 22,
                      top: pos.y * boardHeight - 20,
                      width: 44,
                      height: 44,
                      alignItems: "center",
                      justifyContent: "center",
                      opacity:
                        armed || drag ? 0.7 : selected === p.id ? 0.65 : 0.25,
                    }}
                  >
                    <View
                      style={{
                        width: 24,
                        height: 13,
                        borderRadius: 40,
                        borderWidth: 1,
                        borderStyle: "dashed",
                        borderColor: "#F9FFDA",
                        backgroundColor: "#E4F4A320",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          lineHeight: 15,
                          color: "#F9FFDA",
                        }}
                      >
                        +
                      </Text>
                    </View>
                  </Pressable>
                ),
              )}
            {!!placement && !drag && (
              <View
                pointerEvents="none"
                style={[
                  s.dropMarker,
                  {
                    left: placement.x * boardWidth - 17,
                    top: placement.y * boardHeight - 11,
                  },
                ]}
              />
            )}
            {!!drag?.position &&
              drag.position.x >= 0 &&
              drag.position.x <= 1 &&
              drag.position.y >= 0 &&
              drag.position.y <= 1 && (
                <View
                  pointerEvents="none"
                  style={[
                    s.dropMarker,
                    {
                      left: drag.position.x * boardWidth - 17,
                      top: drag.position.y * boardHeight - 11,
                      borderColor: drag.valid ? "#FFFFFF" : "#C45C4B",
                      backgroundColor: drag.valid ? "#F5FFD980" : "#F3B8A66A",
                      zIndex: 150,
                    },
                  ]}
                />
              )}
          </View>
          <View style={s.worldFooter}>
            <Icon name={drag ? "move" : "mouse-pointer"} size={16} />
            <Text style={[T.small, { flex: 1, color: C.forest }]}>
              {drag
                ? drag.valid
                  ? "Release to place."
                  : "Find an open spot."
                : "Drag to plant or move. Or choose a plant, then tap a spot."}
            </Text>
          </View>
          {!showArchive ? actionFeedback : null}
          {!!plot?.plantType && (
            <Card style={{ marginTop: 20, padding: 18, gap: 12 }}>
              <View style={s.headingRow}>
                <View>
                  <Text style={T.h3}>{pretty(plot.plantType)}</Text>
                  <Text style={T.small}>
                    {care === "dead"
                      ? "Ready for a fresh start"
                      : [
                          "Seed",
                          "Sprout",
                          "Growing",
                          isGreenery(plot.plantType)
                            ? "Fully grown"
                            : "Blooming",
                        ][plot.growth]}
                  </Text>
                </View>
                <Tag>Plot {data.plots.indexOf(plot) + 1}</Tag>
              </View>
              <View style={[s.row, { gap: 7 }]}>
                <Icon
                  name={care === "dead" ? "x-circle" : "droplet"}
                  size={16}
                  color={
                    care === "dead"
                      ? C.red
                      : care === "thirsty"
                        ? "#946022"
                        : C.forest
                  }
                />
                <Text
                  testID="garden-selected-care"
                  accessibilityLiveRegion="polite"
                  style={[
                    T.small,
                    {
                      color:
                        care === "dead"
                          ? C.red
                          : care === "thirsty"
                            ? "#946022"
                            : C.forest,
                    },
                  ]}
                >
                  {plot.carePolicy === "non_punitive_v1"
                    ? "Optional care · your plant stays safe"
                    : care === "dead"
                    ? "Dead · 48h without water"
                    : care === "thirsty"
                      ? `Needs water · ${timeLeft(careRemainingMs(plot, now))} left`
                      : `Water within ${timeLeft(careRemainingMs(plot, now))}`}
                </Text>
              </View>
              <View style={s.row}>
                {care === "dead" ? (
                  <>
                    <Button
                      label="Replant · 1 seed"
                      icon="refresh-cw"
                      disabled={disabled || data.wallet.seeds < 1}
                      loading={busy}
                      onPress={() => careAction("replant")}
                    />
                    <Button
                      label="Clear"
                      variant="secondary"
                      disabled={disabled}
                      onPress={() => careAction("clear")}
                    />
                    {data.wallet.seeds < 1 ? (
                      <Button
                        label="Earn seeds"
                        variant="ghost"
                        onPress={startPractice}
                      />
                    ) : null}
                  </>
                ) : (
                  <>
                    <Button
                      label={data.profile.dailyWorkout ? "Water · free" : "Water · 1 water"}
                      icon="droplet"
                      disabled={disabled || (!data.profile.dailyWorkout && data.wallet.water < 1)}
                      loading={busy}
                      onPress={() => careAction("water")}
                    />
                    <Button
                      label="Archive"
                      variant="secondary"
                      icon="archive"
                      disabled={disabled}
                      onPress={() => careAction("archive")}
                    />
                    {!data.profile.dailyWorkout && data.wallet.water < 1 ? (
                      <Button
                        label="Earn water"
                        variant="ghost"
                        onPress={startPractice}
                      />
                    ) : null}
                  </>
                )}
              </View>
              <View style={[s.row, { justifyContent: "space-between" }]}>
                <Text style={T.small}>Move · free</Text>
                <View style={s.row}>
                  {[
                    ["left", -0.06, 0],
                    ["up", 0, -0.06],
                    ["down", 0, 0.06],
                    ["right", 0.06, 0],
                  ].map(([direction, dx, dy]) => (
                    <Pressable
                      key={direction}
                      accessibilityRole="button"
                      accessibilityLabel={`Move plant ${direction}`}
                      disabled={disabled}
                      onPress={() => nudge(Number(dx), Number(dy))}
                      style={s.moveButton}
                    >
                      <Icon name={`arrow-${direction}`} size={17} />
                    </Pressable>
                  ))}
                </View>
              </View>
            </Card>
          )}
        </View>
        <View style={{ width: wide ? 306 : "100%", gap: 20 }}>
          <View style={s.studio}>
            <View style={s.tabs}>
              {(["plants", "drawing"] as const).map((tab) => (
                <Pressable
                  key={tab}
                  accessibilityRole="tab"
                  accessibilityLabel={tab === "plants" ? "Plants" : "Draw"}
                  accessibilityState={{ selected: studio === tab }}
                  onPress={() => {
                    setStudio(tab);
                    setArmed(false);
                  }}
                  style={[
                    s.tab,
                    studio === tab && { backgroundColor: C.paper },
                  ]}
                >
                  <Icon
                    name={tab === "plants" ? "feather" : "edit-3"}
                    size={14}
                  />
                  <Text
                    style={[T.small, { fontFamily: "DMBold", color: C.forest }]}
                  >
                    {tab === "plants" ? "Plants" : "Draw"}
                  </Text>
                </Pressable>
              ))}
            </View>
            {studio === "plants" ? (
              wide ? (
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}
                >
                  <View style={{ width: "100%" }}>
                    <PlantCategories
                      value={category}
                      onChange={chooseCategory}
                    />
                  </View>
                  {plants.map((item) => {
                    const locked = data.xp < unlocks[item.type];
                    return (
                      <GardenDrag
                        key={item.type}
                        testID={`seed-packet-${item.type}`}
                        label={
                          locked
                            ? `${item.type}, unlocks at ${unlocks[item.type]} XP`
                            : `Choose ${item.type}`
                        }
                        disabled={disabled || locked || !available}
                        onStart={(point) =>
                          void beginDrag(
                            { kind: "seed", plantType: item.type },
                            point,
                          )
                        }
                        onMove={showDrag}
                        onDrop={finishDrag}
                        onCancel={cancelDrag}
                        onTap={() => choose(item.type)}
                        style={{
                          width: "47%",
                          flexGrow: 1,
                          alignItems: "center",
                          borderRadius: 15,
                          padding: 10,
                          backgroundColor: "#FFFEF9",
                          borderWidth: 1.5,
                          borderColor:
                            plant === item.type ? "#9DAF79" : "#E8E6DA",
                          opacity: locked ? 0.5 : 0.99,
                        }}
                      >
                        <View
                          pointerEvents="none"
                          style={{
                            alignItems: "center",
                            width: "100%",
                            gap: 3,
                          }}
                        >
                          <View
                            style={{
                              width: 78,
                              height: 78,
                              backgroundColor: item.color + "55",
                              borderRadius: 55,
                              alignItems: "center",
                            }}
                          >
                            <MeadowPlant
                              type={item.type}
                              growth={3}
                              size={77}
                            />
                          </View>
                          <Text style={[T.h3, { fontSize: 13 }]}>
                            {item.name}
                          </Text>
                          <Text style={[T.small, { fontSize: 10 }]}>
                            {locked ? `${unlocks[item.type]} XP` : "1 seed"}
                          </Text>
                          <Icon
                            name={locked ? "lock" : "move"}
                            size={12}
                            color="#8C9678"
                          />
                        </View>
                      </GardenDrag>
                    );
                  })}
                </View>
              ) : null
            ) : (
              <View style={{ gap: 12 }}>
                <PlantStudio
                  value={drawing}
                  onChange={setDrawing}
                  disabled={disabled}
                  onDrawingChange={onInteractionChange}
                />
                <GardenDrag
                  testID="doodle-packet"
                  label="Drag your drawing to plant"
                  disabled={disabled || !available || !drawingReady}
                  onStart={(point) =>
                    void beginDrag(
                      {
                        kind: "seed",
                        plantType: "doodle",
                        doodle: drawing,
                      },
                      point,
                    )
                  }
                  onMove={showDrag}
                  onDrop={finishDrag}
                  onCancel={cancelDrag}
                  onTap={() => choose("doodle")}
                  style={{
                    borderWidth: 1,
                    borderStyle: "dashed",
                    borderColor: "#A9B895",
                    borderRadius: 12,
                    minHeight: 78,
                    backgroundColor: C.sage,
                    flexDirection: "row",
                    gap: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: drawingReady ? 1 : 0.5,
                  }}
                >
                  <View pointerEvents="none" style={s.row}>
                    <MeadowPlant
                      type="doodle"
                      growth={3}
                      doodle={drawing}
                      size={64}
                    />
                    <Text
                      style={[
                        T.small,
                        { fontFamily: "DMBold", color: C.forest },
                      ]}
                    >
                      Drag to plant
                    </Text>
                    <Icon name="move" size={16} />
                  </View>
                </GardenDrag>
              </View>
            )}
            {available ? (
              <Button
                label={
                  studio === "drawing"
                    ? "Plant drawing · 1 seed"
                    : "Plant · 1 seed"
                }
                icon="feather"
                disabled={disabled || !canPlant}
                loading={busy}
                onPress={plantSelected}
                style={{ alignSelf: "stretch" }}
              />
            ) : firstEmpty ? (
              <Button
                label="Earn seeds"
                icon="arrow-up-right"
                variant="secondary"
                onPress={startPractice}
              />
            ) : (
              <Text style={[T.small, { textAlign: "center" }]}>
                Garden full · clear or archive a plant
              </Text>
            )}
          </View>
          <View style={{ gap: 12, padding: 8 }}>
            <View style={s.row}>
              <Icon name="sun" size={17} color="#AE934D" />
              <Text style={[T.h3, { fontSize: 14 }]}>Decorations</Text>
            </View>
            {[
              {
                id: "stepping_stones",
                name: "Stepping stones",
                cost: 2,
                icon: "more-horizontal",
              },
              {
                id: "birdbath",
                name: "Birdbath",
                cost: 3,
                icon: "droplet",
              },
            ].map((item) => (
              <Button
                key={item.id}
                label={
                  data.decorations.includes(item.id)
                    ? `${item.name} · placed`
                    : `${item.name} · ${item.cost} sunlight`
                }
                icon={item.icon}
                variant="secondary"
                disabled={
                  disabled ||
                  data.decorations.includes(item.id) ||
                  data.wallet.sunlight < item.cost
                }
                onPress={() =>
                  void mutate(
                    { path: "/garden/decorate", body: { decoration: item.id } },
                    "Decoration added.",
                  )
                }
              />
            ))}
          </View>
        </View>
      </View>
      {!!drag && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: drag.x - 43,
            top: drag.y - 81,
            width: 86,
            height: 86,
            zIndex: 1000,
            opacity: 0.9,
          }}
        >
          <MeadowPlant
            type={drag.cargo.plantType}
            growth={3}
            doodle={drag.cargo.doodle}
            size={86}
            dead={
              !!draggedPlant && plantCareStatus(draggedPlant, now) === "dead"
            }
          />
        </View>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  headingRow: {
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  row: { flexDirection: "row", gap: 9, alignItems: "center", flexWrap: "wrap" },
  workspace: {
    gap: 24,
    borderTopWidth: 1,
    borderColor: C.border,
    paddingTop: 24,
    alignItems: "stretch",
  },
  worldFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    paddingHorizontal: 18,
    borderRadius: 30,
    backgroundColor: "#EBEFDFA0",
    marginTop: 6,
  },
  studio: {
    backgroundColor: "#F6F4EB",
    borderRadius: 21,
    borderWidth: 1,
    borderColor: "#E6E6D8",
    padding: 18,
    gap: 17,
  },
  tabs: {
    flexDirection: "row",
    gap: 4,
    backgroundColor: "#E9EBDD",
    padding: 4,
    borderRadius: 11,
  },
  tab: {
    flex: 1,
    minHeight: 40,
    borderRadius: 8,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  dropMarker: {
    position: "absolute",
    width: 34,
    height: 22,
    borderRadius: 50,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#FFF7DD",
    backgroundColor: "#FCFFD960",
  },
  notice: {
    borderRadius: 12,
    backgroundColor: C.sage,
    padding: 13,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  moveButton: {
    width: 44,
    height: 44,
    borderRadius: 9,
    backgroundColor: C.sage,
    alignItems: "center",
    justifyContent: "center",
  },
});
