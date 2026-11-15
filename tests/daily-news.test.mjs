import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { selectDailyNews, dailyNewsPrompt } from "../server/daily-news.mjs";
import { createApp } from "../server/app.mjs";
import { articles } from "../server/content.mjs";

const story = (id, extra = {}) => ({ id, title: `A new discovery ${id}`, source: "NASA", sourceUrl: `https://www.nasa.gov/${id}`, publishedAt: "2026-11-15T09:00:00Z", category: "Science", ...extra });
test("daily stories exclude reading sources and history by ID, canonical URL and normalized headline", () => {
  const a = story("a"), b = story("b"), c = story("c"), d = story("d");
  const result = selectDailyNews({ items: [a, b, c, d], reserved: [{...a, id:"reading-a", sourceUrl:a.sourceUrl+'?utm_source=test'}], history:[{newsSource:{...b,id:"old-b",sourceUrl:"https://example.com/other",title:b.title.toUpperCase()+"!"}},{articleId:c.id}] });
  assert.equal(result.id, "d");
  assert.equal(selectDailyNews({items:[a],reserved:[a]}),null);
  assert.match(dailyNewsPrompt(d).context,/headline only/);
  assert.match(dailyNewsPrompt(d).context,/discovery d/);
});

test("API reserves distinct news stories, preserves idempotency, and keeps Read & Reflect separate", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "daily-news-"));
  const feed = [story("reserved", {sourceUrl:articles[0].sourceUrl}), story("one"), story("two")];
  const service = createApp({ dbPath:join(directory,"test.sqlite"),storageDir:join(directory,"audio"),apiKey:"",disableWorker:true,newsService:{getFeed:async()=>({articles:feed,status:"ok"})} });
  const server = await new Promise(resolve=>{const value=service.app.listen(0,"127.0.0.1",()=>resolve(value));});
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await service.close();rmSync(directory,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const request=async(path,token,body)=>{
    const response=await fetch(base+path,{method:body?"POST":"GET",headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
    return {status:response.status,data:await response.json()};
  };
  const token=(await request("/auth/guest",null,{})).data.token;
  await request("/daily-workout/enroll",token,{});
  const first=await request("/sessions",token,{mode:"spin_speak",idempotencyKey:"news-first"});
  assert.equal(first.status,201);
  assert.equal(first.data.newsSource.id,"one");
  const again=await request("/sessions",token,{mode:"spin_speak",idempotencyKey:"news-first"});
  assert.equal(again.data.id,first.data.id);
  const results=await Promise.all([request("/sessions",token,{mode:"spin_speak"}),request("/sessions",token,{mode:"spin_speak"})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[201,503]);
  assert.equal(results.find(r=>r.status===201).data.newsSource.id,"two");
  const reading=await request("/sessions",token,{mode:"read_reflect",articleId:articles[0].id});
  assert.equal(reading.status,201);
  assert.notEqual(reading.data.articleId,first.data.newsSource.id);
  // A previously assigned daily story must remain reserved even if the curated
  // reading catalogue later gains that source.
  await service.db.prepare("UPDATE sessions SET data=? WHERE id=?").run(JSON.stringify({...first.data,newsSource:articles[0]}),first.data.id);
  assert.equal((await request("/sessions",token,{mode:"read_reflect",articleId:articles[0].id})).status,409);
  const other=(await request("/auth/guest",null,{})).data.token;
  await request("/daily-workout/enroll",other,{});
  assert.equal((await request("/sessions",other,{mode:"spin_speak"})).data.newsSource.id,"one");
});
