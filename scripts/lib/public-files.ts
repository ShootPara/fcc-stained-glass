/** Select deployed derivatives without removing any source or restoration package. */
export function publicFileSelector(catalog: {
 photos: readonly {image: null | {web:{path:string};thumbnail:{path:string}}}[];
 artworks: readonly {versions:Readonly<Record<string,{accessibility:{path:string}}>>}[];
}) {
 const referenced=new Set<string>();
 for(const photo of catalog.photos)if(photo.image){referenced.add(photo.image.web.path);referenced.add(photo.image.thumbnail.path);}
 for(const artwork of catalog.artworks)for(const version of Object.values(artwork.versions))referenced.add(version.accessibility.path);
 return (file:string)=>file!=='catalog.dev.json'&&(!(file.startsWith('photos/')||file.startsWith('accessibility/'))||referenced.has(file));
}
