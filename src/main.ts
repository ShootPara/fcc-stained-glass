import './styles.css';
import { assetUrl } from './config.js';
import { DevelopmentCatalogSchema, type DevelopmentCatalog, type PublicArtwork, type PublicPhoto } from './shared/public-catalog.js';
import { mountColoringEditor } from './editor/view.js';
import { listSavedVersions } from './editor/storage.js';

const app = document.querySelector<HTMLDivElement>('#app')!;
let catalog: DevelopmentCatalog | undefined;
let catalogError = false;
let activeScreenAbort: AbortController | null = null;
let activeScreenDispose: (() => void) | null = null;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function link(label: string, href: string, className?: string): HTMLAnchorElement {
  const node = element('a', label, className);
  node.href = href;
  return node;
}

function picture(path: string, alt: string, width: number, height: number, thumbnail = false): HTMLImageElement {
  const img = element('img', undefined, thumbnail ? 'thumbnail' : 'picture');
  img.src = assetUrl(path);
  img.alt = alt;
  img.width = width;
  img.height = height;
  img.decoding = 'async';
  if (thumbnail) img.loading = 'lazy';
  return img;
}

function navigation(main: HTMLElement, label: string, href: string): void {
  const nav = element('nav', undefined, 'page-navigation');
  nav.setAttribute('aria-label', 'Page navigation');
  nav.append(link('Home', '#/'), link(label, href));
  main.append(nav);
}

function notFound(main: HTMLElement): void {
  document.title = 'Page not found · First Congregational Church';
  main.append(element('h1', 'We could not find that page.'), link('Go to Home', '#/', 'action'));
}

function loading(main: HTMLElement): void {
  const status = element('p', catalogError ? 'The pictures could not be loaded.' : 'Loading…', 'notice');
  status.setAttribute('role', catalogError ? 'alert' : 'status');
  main.append(status);
  if (catalogError) {
    const retry = element('button', 'Try again', 'action');
    retry.type = 'button';
    retry.addEventListener('click', () => { void loadCatalog(); });
    main.append(retry);
  }
}

function citations(main: HTMLElement, values: string[]): void {
  if (!values.length) return;
  main.append(element('h2', 'Sources'));
  const list = element('ul');
  values.forEach(value => list.append(element('li', value)));
  main.append(list);
}

function photoCard(photo: PublicPhoto): HTMLLIElement {
  const item = element('li');
  if (photo.image) item.append(picture(photo.image.thumbnail.path, photo.alt, photo.image.width, photo.image.height, true));
  item.append(element('h2', photo.title));
  item.append(photo.image ? link('View photo', `#/about/${photo.id}`, 'action') : element('p', 'Coming soon'));
  return item;
}

function artworkCard(artwork: PublicArtwork): HTMLLIElement {
  const item = element('li');
  const prepared = artwork.activeVersion ? artwork.versions[artwork.activeVersion] : undefined;
  if (prepared) item.append(picture(prepared.canonical.path, artwork.title, prepared.width, prepared.height, true));
  item.append(element('h2', artwork.title));
  if (prepared && prepared.reviewState !== 'complete') item.append(element('p', 'Region review pending', 'review-pending'));
  item.append(prepared ? link('Color this page', `#/coloring/${artwork.id}`, 'action') : element('p', 'Coming soon'));
  item.append(element('p',`Coloring page ${artwork.bookNumber}`));
  if(artwork.printable){
    const pdf=link('Download this page (PDF)',assetUrl(artwork.printable.path),'action');
    pdf.download=`fcc-${artwork.id}.pdf`;item.append(pdf);
  }
  return item;
}

function photoDetail(main: HTMLElement, photo: PublicPhoto): void {
  navigation(main, 'All photographs', '#/about');
  document.title = `${photo.title} · First Congregational Church`;
  main.append(element('h1', photo.title));
  if (!photo.image) { main.append(element('p', 'This photograph is not ready yet.', 'notice')); return; }
  main.append(picture(photo.image.web.path, photo.alt, photo.image.width, photo.image.height));
  main.append(element('p', photo.description));
  const locationLabel = photo.location.confidence === 'likely' ? 'Likely location' : 'Location';
  main.append(element('p', `${locationLabel}: ${photo.location.value ?? 'Not yet identified.'}`));
  for (const id of photo.relatedArtworkIds) {
    main.append(link('View coloring page', `#/coloring/${id}`, 'action'));
  }
  citations(main, photo.citations);
}

function artworkDetail(main: HTMLElement, artwork: PublicArtwork, signal: AbortSignal): void {
  navigation(main, 'Back to pages', '#/coloring');
  document.title = `${artwork.title} · First Congregational Church`;
  main.classList.add('coloring-screen');
  main.setAttribute('aria-label', artwork.title);
  const prepared = artwork.activeVersion ? artwork.versions[artwork.activeVersion] : undefined;
  if (!prepared) { main.append(element('p', artwork.availabilityMessage ?? 'This coloring page is not ready yet.', 'notice')); return; }

  const editorHost = element('section', undefined, 'editor-host');
  editorHost.setAttribute('aria-label', 'Coloring tool');
  main.append(editorHost);
  const photo = artwork.originalPhotoId ? catalog?.photos.find(item => item.id === artwork.originalPhotoId) : undefined;
  void (async () => {
    const namespace = `fcc-kalamazoo-stained-glass:${new URL(import.meta.env.BASE_URL, document.baseURI).pathname}`;
    const versions = await listSavedVersions(namespace, artwork.id);
    if (signal.aborted) return;
    const archived = versions.filter(version => version !== artwork.activeVersion && artwork.versions[version]);
    const start = (version: string) => {
      if (signal.aborted) return;
      activeScreenDispose = mountColoringEditor(editorHost, { artwork, prepared: artwork.versions[version]!, photo, signal });
    };
    if (!archived.length) { start(prepared.contentVersion); return; }
    editorHost.append(element('p', 'A new version of this page is available.'));
    for (const version of archived) {
      const button = element('button', 'Continue saved picture', 'action'); button.type = 'button';
      button.addEventListener('click', () => start(version)); editorHost.append(button);
    }
    const blank = element('button', 'Start the new page', 'action'); blank.type = 'button';
    blank.addEventListener('click', () => start(prepared.contentVersion)); editorHost.append(blank);
  })();

  main.append(element('p', artwork.description));
  if (prepared.reviewState !== 'complete') main.append(element('p', 'Preparation preview: small regions and keyboard names are still being reviewed.', 'review-pending'));
  const actions = element('div', undefined, 'actions');
  const download = link('Download drawing (PNG)', assetUrl(prepared.canonical.path), 'action');
  download.download = `fcc-${artwork.id}.png`;
  actions.append(download);
  if (artwork.printable) {
    const pdf = link('Download this page (PDF)', assetUrl(artwork.printable.path), 'action');
    pdf.download = `fcc-${artwork.id}.pdf`; actions.append(pdf);
  }
  if (artwork.originalPhotoId) actions.append(link('About this window', `#/about/${artwork.originalPhotoId}`, 'action'));
  main.append(actions);
  if (!artwork.originalPhotoId) main.append(element('p', 'Original photo not yet identified.'));
  citations(main, artwork.citations);
}

function render(): void {
  activeScreenAbort?.abort();
  activeScreenDispose?.();
  activeScreenDispose = null;
  const screenAbort = new AbortController();
  activeScreenAbort = screenAbort;
  const main = element('main');
  main.id = 'main';
  main.tabIndex = -1;
  const route = location.hash || '#/';
  const home = route === '#/' || route === '#';
  if (!route.startsWith('#/coloring/design-')) main.append(element(home ? 'h1' : 'p', 'First Congregational Church · Kalamazoo', home ? 'site-name' : 'eyebrow'));
  if (home) {
    document.title = 'The Stained Glass of First Congregational Church, Kalamazoo.';
    const menu = element('nav', undefined, 'choices');
    menu.setAttribute('aria-label', 'Main choices');
    menu.append(link('About the stained glass', '#/about', 'choice'), link('Coloring pages', '#/coloring', 'choice'));
    main.append(menu);
    if (catalog?.repositoryUrl) {
      const source = link('Project source', catalog.repositoryUrl, 'source-link');
      source.rel = 'noopener'; main.append(source);
    }
  } else if (route === '#/about' || route === '#/coloring') {
    const coloring = route === '#/coloring';
    const title = coloring ? 'Coloring pages' : 'About the stained glass';
    document.title = `${title} · First Congregational Church`;
    main.append(link('Home', '#/', 'home'), element('h1', title));
    if (!catalog) loading(main);
    else {
      if(coloring && catalog.book){
        const download=link('Download the whole book (PDF)',assetUrl(catalog.book.file.path),'action');
        download.download='fcc-coloring-book.pdf';main.append(download);
        main.append(element('p',`48 coloring pages, a cover, an introduction and sources. ${catalog.book.totalPages} PDF pages.`));
      }
      if(!coloring && catalog.history){
        catalog.history.paragraphs.forEach(text=>main.append(element('p',text)));
        const details=element('details');details.append(element('summary','Sources'));
        const sources=element('ul');catalog.history.citations.forEach(text=>sources.append(element('li',text)));
        details.append(sources);main.append(details);
      }
      const list = element('ul', undefined, 'collection');
      if (coloring) catalog.artworks.forEach(artwork => list.append(artworkCard(artwork)));
      else catalog.photos.forEach(photo => list.append(photoCard(photo)));
      main.append(list);
    }
  } else if (/^#\/(?:about\/photo|coloring\/design)-\d{3}$/u.test(route)) {
    if (!catalog) loading(main);
    else {
      const id = route.split('/')[2]!;
      const photo = route.startsWith('#/about/') ? catalog.photos.find(item => item.id === id) : undefined;
      const artwork = route.startsWith('#/coloring/') ? catalog.artworks.find(item => item.id === id) : undefined;
      if (photo) photoDetail(main, photo);
      else if (artwork) artworkDetail(main, artwork, screenAbort.signal);
      else notFound(main);
    }
  } else notFound(main);
  app.replaceChildren(main);
}

async function loadCatalog(): Promise<void> {
  catalogError = false;
  render();
  try {
    const filename = import.meta.env.DEV ? 'catalog.dev.json' : 'catalog.json';
    const response = await fetch(assetUrl(filename), { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    catalog = DevelopmentCatalogSchema.parse(await response.json());
  } catch { catalogError = true; }
  render();
}

addEventListener('hashchange', () => { render(); document.querySelector<HTMLElement>('#main')?.focus(); });
document.querySelector<HTMLAnchorElement>('.skip')?.addEventListener('click', event => {
  event.preventDefault();
  const main = document.querySelector<HTMLElement>('#main');
  main?.focus();
  main?.scrollIntoView({ block: 'start' });
});
void loadCatalog();
