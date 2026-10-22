import type {CategoryRanking,CategoryRankingGroup} from "../lib/categoryRanking";
const usd=(value:string|null)=>value===null?"Unavailable":Number(value).toLocaleString("en-US",{style:"currency",currency:"USD"});
export function CategoryRankingResult({report,onViewListings,listingsAvailable=true}:{report:CategoryRanking;onViewListings?:(group:CategoryRankingGroup)=>void;listingsAvailable?:boolean}){
  return <div className="task-category-ranking">
    <table aria-label="Product category ranking"><caption>{report.metric==="total_price"?"Categories by total listing price":"Categories by listing count"}</caption>
      <thead><tr><th scope="col">Category</th><th scope="col">Listings</th><th scope="col">Total price (USD)</th><th scope="col">Missing price</th>{onViewListings&&<th scope="col"><span className="sr-only">Actions</span></th>}</tr></thead>
      <tbody>{report.groups.map(group=><tr key={group.category_key??"uncategorized"}><th scope="row">{group.category_key===null?"Uncategorized":group.category_label}</th><td>{group.article_count.toLocaleString()}</td><td>{usd(group.total_price_usd)}</td><td>{group.missing_price_count.toLocaleString()}</td>{onViewListings&&<td><button type="button" className="task-queue-button" disabled={!listingsAvailable} onClick={()=>onViewListings(group)} aria-label={`View listings in ${group.category_label}`}>View listings →</button></td>}</tr>)}</tbody>
    </table>
    {report.groups.length===0&&<p>No categories in this matching set.</p>}
    <small>{report.matching_listings?.toLocaleString()} matching listings · {report.priced_listings?.toLocaleString()} with known USD prices · {report.missing_price_listings?.toLocaleString()} missing prices. Showing {report.groups.length} of {report.total_categories} category groups. Each listing counts once per category; bundles can appear in several categories. Uncategorized includes listings without a current category.</small>
  </div>;
}
