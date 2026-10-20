import type { RankedBeer } from '../lib/types'

type Props = {
  rankings: RankedBeer[]
  tastingTitle: string
}

export function RankingPanel({ rankings, tastingTitle }: Props) {
  return (
    <section className="panel full-width">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Ranking</p>
          <h2>Results for {tastingTitle}</h2>
        </div>
        <span className="panel-badge">Derived in the browser</span>
      </div>

      {rankings.length === 0 ? (
        <p className="empty-state" role="status">
          Add beers and complete at least one score row to see a ranking.
        </p>
      ) : (
        <div className="ranking-table-wrap">
          <table className="ranking-table">
            <caption className="sr-only">
              Beer ranking for {tastingTitle}. Only rows with all four criteria count.
              Scores are out of 100.
            </caption>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Beer</th>
                <th scope="col">Votes</th>
                <th scope="col">Score / 100</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((beer) => {
                const meta = [beer.brewery, beer.style].filter(Boolean).join(' · ')

                return (
                  <tr key={beer.beerId} className={beer.rank === null ? 'unranked' : ''}>
                    <td className="rank-cell">
                      {beer.rank === null ? '–' : `#${beer.rank}`}
                    </td>
                    <td>
                      <strong>{beer.name}</strong>
                      {meta ? <span className="beer-meta">{meta}</span> : null}
                    </td>
                    <td>
                      <span>{beer.votes}</span>
                      {beer.incompleteVotes > 0 ? (
                        <span className="beer-meta">
                          {beer.incompleteVotes} incomplete
                        </span>
                      ) : null}
                    </td>
                    <td className="average-cell">
                      {beer.averageScore === null ? (
                        <span className="muted">Not rated</span>
                      ) : (
                        beer.averageScore.toFixed(1)
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
