export type DocumentArtworkPageSize = 'A4' | 'A5' | 'Letter' | 'CR80';

const MIN_200_DPI: Record<DocumentArtworkPageSize,[number,number]> = {
  A4:[1654,2339],
  A5:[1169,1654],
  Letter:[1700,2200],
  CR80:[675,426]
};

/** True when an image falls below approximately 200 DPI for the target page. */
export function isArtworkBelow200Dpi(width:number,height:number,pageSize:DocumentArtworkPageSize):boolean {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return true;
  const [shortSide,longSide]=MIN_200_DPI[pageSize];
  return Math.min(width,height)<shortSide || Math.max(width,height)<longSide;
}
