import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { type TestContext } from 'node:test';
import postcss from 'postcss';
import { installContextMenu } from '../src/themes/fuyukawa-kagari/lib/layout-runtime.mjs';
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('legacy controls and archive layouts no longer contribute CSS rules', () => {
  for (const file of ['theme.css', 'refresh.css']) {
    const css = postcss.parse(read(`src/themes/fuyukawa-kagari/styles/${file}`));
    css.walkRules(rule => assert.doesNotMatch(rule.selector, /\.(?:theme-quick-switch|post-grid|compact-post-row|post-list)(?![\w-])/));
  }
  assert.doesNotMatch(read('src/themes/fuyukawa-kagari/lib/layout-runtime.mjs'), /theme-quick-switch/);
});

test('Markdown heading anchors, dynamic TOC depth and active archive styles remain', () => {
  const theme = read('src/themes/fuyukawa-kagari/styles/theme.css');
  assert.match(theme, /\.heading-anchor\s*\{/);
  assert.match(theme, /\.article-toc \.toc-depth-3\s*\{/);
  assert.match(theme, /\.post-row\s*\{/);
  assert.match(theme, /\.post-cover-frame\s*\{/);
  assert.match(theme, /\.blog-post-copy\s*\{/);
  assert.match(read('astro.config.mjs'), /className: \["heading-anchor"\]/);
  assert.match(read('src/themes/fuyukawa-kagari/components/ArticleTocLinks.astro'), /toc-depth-\$\{heading\.depth\}/);
});

function fixture(t: TestContext) {
  type MockEvent = { key?: string; shiftKey?: boolean; target?: MockElement; preventDefault?: () => void; stopPropagation?: () => void };
  const old = new Map<string, PropertyDescriptor | undefined>();
  class MockElement {
    events = new Map<string, ((event: MockEvent) => unknown)[]>(); children: MockElement[] = []; dataset: Record<string, string> = {}; style = {setProperty() {}};
    offsetWidth = 220; offsetHeight = 340; textContent = ''; focusOptions: FocusOptions | null = null;
    classes = new Set<string>();
    classList = {add: (value: string) => this.classes.add(value), remove: (value: string) => this.classes.delete(value), contains: (value: string) => this.classes.has(value)};
    addEventListener(name: string, handler: (event: MockEvent) => unknown) { const handlers=this.events.get(name) ?? []; handlers.push(handler); this.events.set(name,handlers); }
    async emit(name: string, event: MockEvent) { for(const handler of this.events.get(name) ?? []) await handler(event); }
    contains(element: MockElement) { return element===this || this.children.includes(element); }
    focus(options?: FocusOptions) { document.activeElement=this; this.focusOptions=options ?? null; }
    closest(selector: string) { return selector==='[data-context-action]' && this.dataset.contextAction ? this : null; }
    setAttribute() {}
    getBoundingClientRect() { return {left:20,top:30,width:80,height:30}; }
  }
  for(const key of ['HTMLElement','Element']) {
    old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{configurable:true,value:MockElement});
  }
  t.after(()=>{for(const [key,descriptor] of old) {if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}});
  class MockDocument extends MockElement {
    body = new MockElement();
    activeElement: MockElement = this.body;
    querySelector: (selector: string) => MockElement | null = () => null;
  }
  class MockWindow extends MockElement {
    innerWidth = 390; innerHeight = 844;
    requestAnimationFrame: (callback: () => void) => number = () => 0;
  }
  const document=new MockDocument(), window=new MockWindow(), menu=new MockDocument();
  const origin=new MockElement(), skip=new MockElement(), button=new MockElement();
  document.body=new MockElement(); document.activeElement=origin;
  button.dataset.contextAction='music-autoplay';menu.children=[button];
  menu.querySelector=selector=>selector==='button' || selector.includes('music-autoplay') ? button : null;
  const queries: string[]=[];
  document.querySelector=selector=>{queries.push(selector);return selector==='[data-context-menu]' ? menu : selector==='.skip-to-content' ? skip : null;};
  window.innerWidth=390;window.innerHeight=844;
  const frames: (() => void)[]=[];window.requestAnimationFrame=callback=>{frames.push(callback);return frames.length;};
  let autoplay=false;
  const musicPlayer={isAutoplayEnabled:()=>autoplay,setAutoplayEnabled:(value: boolean)=>{autoplay=value;}};
  installContextMenu({documentRef:document as unknown as Document,windowRef:window as unknown as Window & typeof globalThis,musicPlayer});
  const open=async(key='ContextMenu')=>{let prevented=false;await window.emit('keydown',{key,shiftKey:key==='F10',preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(menu.classes.has('is-open'),true);assert.equal(document.activeElement,button);};
  return {document,window,menu,origin,skip,button,queries,open,frames};
}

for(const key of ['ContextMenu','F10']) {
  test(`${key} and Escape restore the original keyboard trigger without scrolling`, async t=>{
    const f=fixture(t);await f.open(key);await f.window.emit('keydown',{key:'Escape'});
    assert.equal(f.menu.classes.has('is-open'),false);assert.equal(f.document.activeElement,f.origin);
    assert.deepEqual(f.origin.focusOptions,{preventScroll:true});
  });
}

test('keyboard opening from body returns focus to the existing skip link', async t=>{
  const f=fixture(t);f.document.activeElement=f.document.body;await f.open();
  await f.window.emit('keydown',{key:'Escape'});
  assert.equal(f.document.activeElement,f.skip);
  assert.ok(!f.queries.includes('.theme-quick-switch'));
});

test('a keyboard menu action restores the trigger after changing autoplay', async t=>{
  const f=fixture(t);await f.open();
  await f.window.emit('click',{target:f.button,stopPropagation(){}});
  assert.equal(f.menu.classes.has('is-open'),false);assert.equal(f.document.activeElement,f.origin);
  assert.deepEqual(f.origin.focusOptions,{preventScroll:true});
});

test('a visibility transition retries keyboard focus after a rendered frame', async t=>{
  const f=fixture(t);const focus=f.button.focus.bind(f.button);let attempts=0;
  f.button.focus=options=>{attempts++;if(attempts>1)focus(options);};
  await f.window.emit('keydown',{key:'ContextMenu',preventDefault(){}});
  assert.equal(f.document.activeElement,f.origin);
  assert.equal(f.frames.length,1);f.frames[0]();
  assert.equal(f.frames.length,2);f.frames[1]();
  assert.equal(f.document.activeElement,f.button);
  await f.window.emit('keydown',{key:'Escape'});
  assert.equal(f.document.activeElement,f.origin);
});

test('closing the menu before a deferred focus frame prevents focus stealing', async t=>{
  const f=fixture(t);f.button.focus=()=>{};
  await f.window.emit('keydown',{key:'ContextMenu',preventDefault(){}});
  assert.equal(f.frames.length,1);await f.window.emit('keydown',{key:'Escape'});
  f.button.focus=()=>assert.fail('closed menu must not regain focus');
  f.frames[0]();assert.equal(f.document.activeElement,f.origin);
});
