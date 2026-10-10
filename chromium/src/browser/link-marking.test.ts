import {afterEach, describe, expect, it, vi} from "vitest";
import {enableLinkMarking, disableLinkMarking, isLinkMarkingEnabled, removeUnpermittedLinkScripts, restoreLinkMarkers, LINK_ORIGINS, LINK_SCRIPT_ID} from "./link-marking";
afterEach(()=>vi.unstubAllGlobals());
function mocks(granted = true) {
 const scripting = {getRegisteredContentScripts:vi.fn(async():Promise<chrome.scripting.RegisteredContentScript[]>=>[]),registerContentScripts:vi.fn(async()=>{}),unregisterContentScripts:vi.fn(async()=>{}),executeScript:vi.fn(async()=>{})};
 const permissions = {request:vi.fn(async()=>granted),contains:vi.fn(async()=>granted),remove:vi.fn(async()=>true)};
 const tabs = {query:vi.fn(async()=>[{id:42},{id:43}]),sendMessage:vi.fn(async()=>{})};
 const data: Record<string,unknown> = {};
 const storage={local:{get:vi.fn(async()=>({...data})),set:vi.fn(async(values:Record<string,unknown>)=>{Object.assign(data,values);})}};
 vi.stubGlobal("chrome",{scripting,permissions,tabs,storage});
 return {scripting,permissions,tabs,storage};
}
describe("global link marking",()=>{
 it("re-registers after browser drops registrations without dropping permission",async()=>{
  const api=mocks();
  await enableLinkMarking();
  api.scripting.registerContentScripts.mockClear();
  // Exactly the user report: both permissions granted, registered scripts empty.
  await restoreLinkMarkers();
  expect(api.scripting.registerContentScripts).toHaveBeenCalledTimes(1);
  expect(await isLinkMarkingEnabled()).toBe(true);
 });
 it("requests both web schemes from the user gesture and injects every open tab",async()=>{
  const api=mocks();
  const enabling=enableLinkMarking();
  expect(api.permissions.request).toHaveBeenCalledWith({origins:LINK_ORIGINS});
  expect(await enabling).toBe(true);
  expect(api.scripting.registerContentScripts).toHaveBeenCalledWith([expect.objectContaining({id:LINK_SCRIPT_ID,matches:LINK_ORIGINS,persistAcrossSessions:true})]);
  expect(api.scripting.executeScript).toHaveBeenCalledTimes(2);
 });
 it("restores scripts in existing tabs on startup only when enabled",async()=>{
  const api=mocks();
  await restoreLinkMarkers();
  expect(api.scripting.executeScript).not.toHaveBeenCalled();
  api.scripting.getRegisteredContentScripts.mockResolvedValue([{id:LINK_SCRIPT_ID,js:["assets/link-markers.js"]}]);
  await restoreLinkMarkers();
  expect(api.scripting.executeScript).toHaveBeenCalledTimes(2);
 });
 it("stays off when permission is denied",async()=>{
  const api=mocks(false);
  expect(await enableLinkMarking()).toBe(false);
  expect(api.scripting.registerContentScripts).not.toHaveBeenCalled();
  expect(api.scripting.executeScript).not.toHaveBeenCalled();
  expect(await isLinkMarkingEnabled()).toBe(false);
 });
 it("continues when a protected or closed tab rejects injection",async()=>{
  const api=mocks();api.scripting.executeScript.mockRejectedValueOnce(new Error("Cannot access"));
  expect(await enableLinkMarking()).toBe(true);
  expect(api.scripting.executeScript).toHaveBeenCalledTimes(2);
 });
 it("unregisters, removes all overlays and releases host permissions on disable",async()=>{
  const api=mocks();api.scripting.getRegisteredContentScripts.mockResolvedValue([{id:LINK_SCRIPT_ID,js:["assets/link-markers.js"]}]);
  await disableLinkMarking();
  expect(api.scripting.unregisterContentScripts).toHaveBeenCalledWith({ids:[LINK_SCRIPT_ID]});
  expect(api.tabs.sendMessage).toHaveBeenCalledTimes(2);
  expect(api.permissions.remove).toHaveBeenCalledWith({origins:LINK_ORIGINS});
 });
 it("requires registration and full permission, including after revocation",async()=>{
  const api=mocks();
  expect(await isLinkMarkingEnabled()).toBe(false);
  api.scripting.getRegisteredContentScripts.mockResolvedValue([{id:LINK_SCRIPT_ID,js:["assets/link-markers.js"]}]);
  expect(await isLinkMarkingEnabled()).toBe(true);
  api.permissions.contains.mockResolvedValue(false);
  expect(await isLinkMarkingEnabled()).toBe(false);
  await removeUnpermittedLinkScripts();
  expect(api.scripting.unregisterContentScripts).toHaveBeenCalledWith({ids:[LINK_SCRIPT_ID]});
 });
});
