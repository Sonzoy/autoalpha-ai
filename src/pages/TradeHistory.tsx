import React, { useState } from 'react'
import { useStore } from '../store/store'
import { Badge, Segmented, fmtTime, fmtUsd, statusTone } from '../components/ui'
import type { OrderStatus } from '../types'

type Filter = 'All' | OrderStatus

export default function TradeHistory() {
  const trades = useStore(s => s.trades)
  const [filter, setFilter] = useState<Filter>('All')

  const rows = trades.filter(t => filter === 'All' || t.status === filter)
  const closed = trades.filter(t => t.status === 'Closed')
  const realized = closed.reduce((a, t) => a + t.pnl, 0)
  const wins = closed.filter(t => t.pnl > 0).length

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="card row spread wrap">
        <div className="row wrap">
          <Badge tone={realized >= 0 ? 'green' : 'red'}>Realized P&L {fmtUsd(realized)}</Badge>
          <Badge tone="blue">{closed.length} closed · {wins} winners · {closed.length - wins} losers</Badge>
          <Badge tone="gray">{trades.filter(t => t.status === 'Rejected').length} rejected by risk/broker</Badge>
        </div>
        <Segmented<Filter>
          options={['All', 'Filled', 'Closed', 'Rejected'] as Filter[]}
          value={filter} onChange={setFilter}
        />
      </div>

      <div className="card">
        <h3>Trade history</h3>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Time</th><th>Asset</th><th>Market</th><th>Broker</th><th>Dir</th>
                <th>Entry</th><th>Exit</th><th>Qty</th><th>Stop</th><th>Target</th>
                <th>P&L</th><th>Strategy</th><th>Conf</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={14} className="muted">No trades match this filter.</td></tr>}
              {rows.map(t => (
                <tr key={t.id}>
                  <td className="small">{fmtTime(t.openedAt)}</td>
                  <td><strong>{t.symbol}</strong></td>
                  <td className="small">{t.market}</td>
                  <td className="small">{t.broker.toUpperCase()}</td>
                  <td><Badge tone={t.direction === 'Long' ? 'green' : 'red'}>{t.direction}</Badge></td>
                  <td className="mono">{t.entryPrice.toFixed(2)}</td>
                  <td className="mono">{t.exitPrice ? t.exitPrice.toFixed(2) : '—'}</td>
                  <td className="mono">{t.qty}</td>
                  <td className="mono">{t.stopLoss.toFixed(2)}</td>
                  <td className="mono">{t.takeProfit.toFixed(2)}</td>
                  <td className={`mono ${t.pnl >= 0 ? 'pos' : 'neg'}`}>{t.status === 'Closed' ? fmtUsd(t.pnl) : '—'}</td>
                  <td className="small">{t.strategy}</td>
                  <td className="mono">{t.confidence}</td>
                  <td><Badge tone={statusTone(t.status)}>{t.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
