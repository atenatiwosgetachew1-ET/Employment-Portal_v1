import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

export function D3HorizontalBarChart({ data, title, subtitle, color, formatter = (value) => value, compact = false }) {
  const chartData = Array.isArray(data) ? data.filter((item) => Number.isFinite(Number(item?.value))) : []

  if (!chartData.length) {
    return (
      <article className="reports-chart-card">
        <div className="reports-chart-header">
          <div>
            <p className="concept-card-kicker">Chart</p>
            <h3>{title}</h3>
            {subtitle ? <p className="muted-text reports-card-note">{subtitle}</p> : null}
          </div>
        </div>
        <div className="reports-chart-empty">No chart data available yet.</div>
      </article>
    )
  }

  const width = 720
  const rowHeight = 42
  const margin = { top: 18, right: 28, bottom: 24, left: 158 }
  const innerHeight = chartData.length * rowHeight
  const height = margin.top + innerHeight + margin.bottom
  const maxValue = d3.max(chartData, (item) => Number(item.value)) || 0
  const xScale = d3.scaleLinear().domain([0, Math.max(maxValue, 1)]).range([margin.left, width - margin.right])
  const yScale = d3
    .scaleBand()
    .domain(chartData.map((item) => item.label))
    .range([margin.top, margin.top + innerHeight])
    .padding(0.28)
  const ticks = xScale.ticks(4)
  const resolvedColor = color || accentRgb(0.88)

  return (
    <article className={`reports-chart-card${compact ? ' is-compact' : ''}`}>
      <div className="reports-chart-header">
        <div>
          <p className="concept-card-kicker">Chart</p>
          <h3>{title}</h3>
          {subtitle ? <p className="muted-text reports-card-note">{subtitle}</p> : null}
        </div>
      </div>
      <div className="reports-chart-surface">
        <svg viewBox={`0 0 ${width} ${height}`} className="reports-chart-svg" role="img" aria-label={title}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={xScale(tick)}
                x2={xScale(tick)}
                y1={margin.top - 4}
                y2={margin.top + innerHeight + 4}
                className="reports-chart-grid-line"
              />
              <text x={xScale(tick)} y={height - 6} textAnchor="middle" className="reports-chart-grid-label">
                {formatter(tick)}
              </text>
            </g>
          ))}
          {chartData.map((item) => {
            const y = yScale(item.label) ?? margin.top
            const barHeight = yScale.bandwidth()
            const barWidth = Math.max(0, xScale(Number(item.value)) - margin.left)
            return (
              <g key={item.label}>
                <text x={margin.left - 12} y={y + barHeight / 2 + 4} textAnchor="end" className="reports-chart-axis-label">
                  {item.label}
                </text>
                <rect
                  x={margin.left}
                  y={y}
                  width={width - margin.left - margin.right}
                  height={barHeight}
                  rx="8"
                  className="reports-chart-track"
                />
                <rect
                  x={margin.left}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx="8"
                  fill={resolvedColor}
                  className="reports-chart-bar"
                />
                <text
                  x={Math.min(width - margin.right - 4, margin.left + barWidth + 8)}
                  y={y + barHeight / 2 + 4}
                  textAnchor={margin.left + barWidth + 82 > width - margin.right ? 'end' : 'start'}
                  className="reports-chart-value"
                >
                  {formatter(item.value)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </article>
  )
}

export function D3StageChart({ data, title, subtitle }) {
  const chartData = Array.isArray(data) ? data.filter((item) => Number.isFinite(Number(item?.value))) : []

  if (!chartData.length) {
    return (
      <article className="reports-chart-card">
        <div className="reports-chart-header">
          <div>
            <p className="concept-card-kicker">Chart</p>
            <h3>{title}</h3>
            {subtitle ? <p className="muted-text reports-card-note">{subtitle}</p> : null}
          </div>
        </div>
        <div className="reports-chart-empty">No chart data available yet.</div>
      </article>
    )
  }

  const width = 720
  const height = 240
  const margin = { top: 28, right: 24, bottom: 52, left: 24 }
  const maxValue = d3.max(chartData, (item) => Number(item.value)) || 1
  const xScale = d3
    .scaleBand()
    .domain(chartData.map((item) => item.label))
    .range([margin.left, width - margin.right])
    .padding(0.16)
  const yScale = d3.scaleLinear().domain([0, maxValue]).range([height - margin.bottom, margin.top])

  return (
    <article className="reports-chart-card">
      <div className="reports-chart-header">
        <div>
          <p className="concept-card-kicker">Chart</p>
          <h3>{title}</h3>
          {subtitle ? <p className="muted-text reports-card-note">{subtitle}</p> : null}
        </div>
      </div>
      <div className="reports-chart-surface">
        <svg viewBox={`0 0 ${width} ${height}`} className="reports-chart-svg" role="img" aria-label={title}>
          {chartData.map((item, index) => {
            const x = xScale(item.label) ?? margin.left
            const next = chartData[index + 1]
            const currentCenter = x + xScale.bandwidth() / 2
            const y = yScale(Number(item.value))
            const boxHeight = height - margin.bottom - y
            const nextCenter = next ? (xScale(next.label) ?? margin.left) + xScale.bandwidth() / 2 : null
            return (
              <g key={item.label}>
                {nextCenter !== null ? (
                  <line
                    x1={currentCenter}
                    x2={nextCenter}
                    y1={y + boxHeight / 2}
                    y2={yScale(Number(next.value)) + (height - margin.bottom - yScale(Number(next.value))) / 2}
                    className="reports-stage-link"
                  />
                ) : null}
                <rect x={x} y={y} width={xScale.bandwidth()} height={boxHeight} rx="14" className="reports-stage-bar" />
                <text x={currentCenter} y={y - 10} textAnchor="middle" className="reports-stage-value">
                  {item.value}
                </text>
                <text x={currentCenter} y={height - 20} textAnchor="middle" className="reports-chart-axis-label">
                  {item.label}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </article>
  )
}

export function D3DonutChart({ data, title, subtitle, formatter = (value) => value }) {
  const chartData = Array.isArray(data) ? data.filter((item) => Number.isFinite(Number(item?.value)) && Number(item.value) > 0) : []

  if (!chartData.length) {
    return (
      <article className="reports-chart-card">
        <div className="reports-chart-header">
          <div>
            <p className="concept-card-kicker">Chart</p>
            <h3>{title}</h3>
            {subtitle ? <p className="muted-text reports-card-note">{subtitle}</p> : null}
          </div>
        </div>
        <div className="reports-chart-empty">No chart data available yet.</div>
      </article>
    )
  }

  const width = 720
  const height = 260
  const radius = 78
  const centerX = 158
  const centerY = 128
  const colors = createAccentPalette(chartData.length)
  const pie = d3.pie().value((item) => Number(item.value)).sort(null)(chartData)
  const arc = d3.arc().innerRadius(radius * 0.58).outerRadius(radius)
  const total = d3.sum(chartData, (item) => Number(item.value))

  return (
    <article className="reports-chart-card">
      <div className="reports-chart-header">
        <div>
          <p className="concept-card-kicker">Chart</p>
          <h3>{title}</h3>
          {subtitle ? <p className="muted-text reports-card-note">{subtitle}</p> : null}
        </div>
      </div>
      <div className="reports-chart-surface">
        <svg viewBox={`0 0 ${width} ${height}`} className="reports-chart-svg" role="img" aria-label={title}>
          <g transform={`translate(${centerX}, ${centerY})`}>
            {pie.map((segment, index) => (
              <path key={segment.data.label} d={arc(segment) || ''} fill={colors[index % colors.length]} className="reports-donut-segment" />
            ))}
            <text textAnchor="middle" y="-4" className="reports-donut-total-value">{total}</text>
            <text textAnchor="middle" y="14" className="reports-donut-total-label">Total</text>
          </g>
          <g transform="translate(320, 42)">
            {chartData.map((item, index) => (
              <g key={item.label} transform={`translate(0, ${index * 32})`}>
                <rect width="12" height="12" rx="3" fill={colors[index % colors.length]} />
                <text x="22" y="10" className="reports-chart-axis-label">{item.label}</text>
                <text x="240" y="10" textAnchor="end" className="reports-chart-value">{formatter(item.value)}</text>
              </g>
            ))}
          </g>
        </svg>
      </div>
    </article>
  )
}

export function D3LineChart({ data, title, subtitle, formatter = (value) => value }) {
  const chartData = Array.isArray(data) ? data.filter((item) => Number.isFinite(Number(item?.value))) : []

  if (!chartData.length) {
    return (
      <article className="reports-chart-card">
        <div className="reports-chart-header">
          <div>
            <p className="concept-card-kicker">Chart</p>
            <h3>{title}</h3>
            {subtitle ? <p className="muted-text reports-card-note">{subtitle}</p> : null}
          </div>
        </div>
        <div className="reports-chart-empty">No chart data available yet.</div>
      </article>
    )
  }

  const width = 720
  const height = 280
  const margin = { top: 22, right: 26, bottom: 42, left: 64 }
  const xScale = d3
    .scalePoint()
    .domain(chartData.map((item) => item.label))
    .range([margin.left, width - margin.right])
  const maxValue = d3.max(chartData, (item) => Number(item.value)) || 1
  const yScale = d3.scaleLinear().domain([0, maxValue]).nice().range([height - margin.bottom, margin.top])
  const line = d3
    .line()
    .x((item) => xScale(item.label) ?? margin.left)
    .y((item) => yScale(Number(item.value)))
  const ticks = yScale.ticks(4)

  return (
    <article className="reports-chart-card">
      <div className="reports-chart-header">
        <div>
          <p className="concept-card-kicker">Chart</p>
          <h3>{title}</h3>
          {subtitle ? <p className="muted-text reports-card-note">{subtitle}</p> : null}
        </div>
      </div>
      <div className="reports-chart-surface">
        <svg viewBox={`0 0 ${width} ${height}`} className="reports-chart-svg" role="img" aria-label={title}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={margin.left} x2={width - margin.right} y1={yScale(tick)} y2={yScale(tick)} className="reports-chart-grid-line" />
              <text x={margin.left - 10} y={yScale(tick) + 4} textAnchor="end" className="reports-chart-grid-label">
                {formatter(tick)}
              </text>
            </g>
          ))}
          <path d={line(chartData) || ''} className="reports-line-path" />
          {chartData.map((item) => {
            const x = xScale(item.label) ?? margin.left
            const y = yScale(Number(item.value))
            return (
              <g key={item.label}>
                <circle cx={x} cy={y} r="4.5" className="reports-line-point" />
                <text x={x} y={height - 16} textAnchor="middle" className="reports-chart-axis-label">{item.label}</text>
              </g>
            )
          })}
        </svg>
      </div>
    </article>
  )
}

export function D3ScatterChart({ data, title, subtitle, xLabel, yLabel }) {
  const chartData = Array.isArray(data)
    ? data.filter((item) => Number.isFinite(Number(item?.x)) && Number.isFinite(Number(item?.y)))
    : []

  if (!chartData.length) {
    return (
      <article className="reports-chart-card">
        <div className="reports-chart-header">
          <div>
            <p className="concept-card-kicker">Chart</p>
            <h3>{title}</h3>
            {subtitle ? <p className="muted-text reports-card-note">{subtitle}</p> : null}
          </div>
        </div>
        <div className="reports-chart-empty">No chart data available yet.</div>
      </article>
    )
  }

  const width = 720
  const height = 300
  const margin = { top: 22, right: 28, bottom: 54, left: 60 }
  const xScale = d3
    .scaleLinear()
    .domain([0, d3.max(chartData, (item) => Number(item.x)) || 1])
    .nice()
    .range([margin.left, width - margin.right])
  const yScale = d3
    .scaleLinear()
    .domain([d3.min(chartData, (item) => Number(item.y)) || 0, d3.max(chartData, (item) => Number(item.y)) || 1])
    .nice()
    .range([height - margin.bottom, margin.top])
  const rScale = d3
    .scaleSqrt()
    .domain([0, d3.max(chartData, (item) => Number(item.size ?? 1)) || 1])
    .range([6, 16])
  const xTicks = xScale.ticks(4)
  const yTicks = yScale.ticks(4)

  return (
    <article className="reports-chart-card">
      <div className="reports-chart-header">
        <div>
          <p className="concept-card-kicker">Chart</p>
          <h3>{title}</h3>
          {subtitle ? <p className="muted-text reports-card-note">{subtitle}</p> : null}
        </div>
      </div>
      <div className="reports-chart-surface">
        <svg viewBox={`0 0 ${width} ${height}`} className="reports-chart-svg" role="img" aria-label={title}>
          {xTicks.map((tick) => (
            <g key={`x-${tick}`}>
              <line x1={xScale(tick)} x2={xScale(tick)} y1={margin.top} y2={height - margin.bottom} className="reports-chart-grid-line" />
              <text x={xScale(tick)} y={height - 16} textAnchor="middle" className="reports-chart-grid-label">{tick}</text>
            </g>
          ))}
          {yTicks.map((tick) => (
            <g key={`y-${tick}`}>
              <line x1={margin.left} x2={width - margin.right} y1={yScale(tick)} y2={yScale(tick)} className="reports-chart-grid-line" />
              <text x={margin.left - 10} y={yScale(tick) + 4} textAnchor="end" className="reports-chart-grid-label">{tick}</text>
            </g>
          ))}
          {chartData.map((item) => {
            const x = xScale(Number(item.x))
            const y = yScale(Number(item.y))
            const radius = rScale(Number(item.size ?? 1))
            return (
              <g key={item.label}>
                <circle cx={x} cy={y} r={radius} className="reports-scatter-point" />
                <text x={x} y={y - radius - 6} textAnchor="middle" className="reports-chart-axis-label">{item.label}</text>
              </g>
            )
          })}
          <text x={(margin.left + width - margin.right) / 2} y={height - 2} textAnchor="middle" className="reports-chart-grid-label">
            {xLabel}
          </text>
          <text
            x="14"
            y={(margin.top + height - margin.bottom) / 2}
            textAnchor="middle"
            transform={`rotate(-90 14 ${(margin.top + height - margin.bottom) / 2})`}
            className="reports-chart-grid-label"
          >
            {yLabel}
          </text>
        </svg>
      </div>
    </article>
  )
}



