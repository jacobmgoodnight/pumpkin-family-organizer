// ES module adapter for the shared organizer and private-gallery search rules.
import "./search-core.js?v=20261106a";
export function guestSearchScore(item,query){return globalThis.PUMPKIN_SEARCH.score(item,query,item.visual);}
