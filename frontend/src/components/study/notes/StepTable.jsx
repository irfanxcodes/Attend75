/**
 * StepTable — renders structured table content for accounting solution steps.
 *
 * Handles three table types returned by the LLM:
 *   "ledger"        — two-column Dr/Cr T-account (Trading A/c, P&L A/c)
 *   "balance_sheet" — Liabilities | Assets layout
 *   "key_value"     — simple label: value rows (working notes, schedules)
 *
 * Content is a JSON string stored in step.content when content_format === "table".
 */

// ── Shared cell styles ─────────────────────────────────────────────────────

const TH = ({ children, align = 'left', colSpan }) => (
  <th
    colSpan={colSpan}
    style={{
      padding: '6px 10px',
      textAlign: align,
      fontWeight: 700,
      fontSize: 11,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      background: '#EDE8DC',
      color: '#6B5E45',
      borderBottom: '2px solid #C4B8A0',
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </th>
)

const TD = ({ children, align = 'left', bold, shade, borderTop }) => (
  <td
    style={{
      padding: '5px 10px',
      textAlign: align,
      fontWeight: bold ? 700 : 400,
      fontSize: 12,
      color: bold ? '#2A2040' : '#3D3560',
      background: shade ? '#F5F1E8' : 'transparent',
      borderTop: borderTop ? '1.5px solid #C4B8A0' : '1px solid #EDE8DC',
      whiteSpace: 'nowrap',
      fontFamily: 'system-ui, sans-serif',
    }}
  >
    {children}
  </td>
)

// ── Ledger (T-account) ─────────────────────────────────────────────────────

function LedgerTable({ data }) {
  const rows = data.rows || []
  const maxRows = Math.max(rows.length, 1)

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '42%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '2%' }} />
          <col style={{ width: '42%' }} />
          <col style={{ width: '12%' }} />
        </colgroup>
        <thead>
          <tr>
            <TH>{data.left_header || 'Dr'}</TH>
            <TH align="right">₹</TH>
            <th style={{ background: '#EDE8DC', borderBottom: '2px solid #C4B8A0' }} />
            <TH>{data.right_header || 'Cr'}</TH>
            <TH align="right">₹</TH>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <TD>{row.left_label || ''}</TD>
              <TD align="right">{row.left_amount || ''}</TD>
              <td style={{ background: '#D4C8B0', width: 1 }} />
              <TD>{row.right_label || ''}</TD>
              <TD align="right">{row.right_amount || ''}</TD>
            </tr>
          ))}
        </tbody>
        {(data.left_total || data.right_total) && (
          <tfoot>
            <tr>
              <TD bold shade borderTop>Total</TD>
              <TD align="right" bold shade borderTop>{data.left_total}</TD>
              <td style={{ background: '#D4C8B0' }} />
              <TD bold shade borderTop>Total</TD>
              <TD align="right" bold shade borderTop>{data.right_total}</TD>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

// ── Balance Sheet ──────────────────────────────────────────────────────────

function BalanceSheetTable({ data }) {
  const liabilities = data.liabilities || []
  const assets = data.assets || []
  const maxRows = Math.max(liabilities.length, assets.length)

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '42%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '2%' }} />
          <col style={{ width: '42%' }} />
          <col style={{ width: '12%' }} />
        </colgroup>
        <thead>
          <tr>
            <TH>Liabilities</TH>
            <TH align="right">₹</TH>
            <th style={{ background: '#EDE8DC', borderBottom: '2px solid #C4B8A0' }} />
            <TH>Assets</TH>
            <TH align="right">₹</TH>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: maxRows }).map((_, i) => {
            const l = liabilities[i]
            const a = assets[i]
            return (
              <tr key={i}>
                <TD bold={l?.bold}>{l?.label || ''}</TD>
                <TD align="right" bold={l?.bold}>{l?.amount || ''}</TD>
                <td style={{ background: '#D4C8B0', width: 1 }} />
                <TD bold={a?.bold}>{a?.label || ''}</TD>
                <TD align="right" bold={a?.bold}>{a?.amount || ''}</TD>
              </tr>
            )
          })}
        </tbody>
        {data.total && (
          <tfoot>
            <tr>
              <TD bold shade borderTop>Total</TD>
              <TD align="right" bold shade borderTop>{data.total}</TD>
              <td style={{ background: '#D4C8B0' }} />
              <TD bold shade borderTop>Total</TD>
              <TD align="right" bold shade borderTop>{data.total}</TD>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

// ── Key-value table (working notes, schedules) ─────────────────────────────

function KeyValueTable({ data }) {
  const rows = data.rows || []
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <TD bold={row.bold}>{row.label}</TD>
              <TD align="right" bold={row.bold}>{row.value}</TD>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────

export default function StepTable({ content, title }) {
  let data = null
  try {
    data = typeof content === 'string' ? JSON.parse(content) : content
  } catch {
    // Fallback: render as plain text if JSON parse fails
    return (
      <pre
        style={{
          fontFamily: 'system-ui, sans-serif',
          fontSize: 12,
          color: '#3D3560',
          whiteSpace: 'pre-wrap',
          margin: 0,
        }}
      >
        {content}
      </pre>
    )
  }

  if (!data) return null

  const tableTitle = data.title || title

  return (
    <div
      style={{
        background: '#FAF7F2',
        border: '1px solid #D4C8B0',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {tableTitle && (
        <div
          style={{
            padding: '6px 10px',
            background: '#EDE8DC',
            borderBottom: '1px solid #D4C8B0',
            fontSize: 11,
            fontWeight: 700,
            color: '#6B5E45',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {tableTitle}
        </div>
      )}

      {data.type === 'ledger' && <LedgerTable data={data} />}
      {data.type === 'balance_sheet' && <BalanceSheetTable data={data} />}
      {data.type === 'key_value' && <KeyValueTable data={data} />}
      {!['ledger', 'balance_sheet', 'key_value'].includes(data.type) && (
        // Unknown type — render rows generically
        <KeyValueTable data={{ rows: Object.entries(data).map(([k, v]) => ({ label: k, value: String(v) })) }} />
      )}
    </div>
  )
}
