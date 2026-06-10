import { useEffect, useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';

interface AnimatedBarChartProps {
  data: Array<{ label: string; value: number; color: string }>;
  height?: number;
  maxValue?: number;
  fitLabels?: boolean;
}

export default function AnimatedBarChart({
  data,
  height = 200,
  maxValue,
  fitLabels = false,
}: AnimatedBarChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const padding = { top: 20, right: 20, bottom: 40, left: 40 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    ctx.clearRect(0, 0, width, height);

    const max = maxValue || Math.max(...data.map(d => d.value)) * 1.1;
    const barWidth = (chartWidth / data.length) * 0.6;
    const gap = (chartWidth / data.length) * 0.4;
    const slotWidth = chartWidth / data.length;

    const drawLabel = (label: string, centerX: number, y: number) => {
      const baseFontSize = 11;
      const minFontSize = 8;
      let fontSize = baseFontSize;
      ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;

      if (fitLabels) {
        const maxLabelWidth = Math.max(slotWidth - 4, 20);
        const measuredWidth = ctx.measureText(label).width;
        if (measuredWidth > maxLabelWidth) {
          fontSize = Math.max(minFontSize, Math.floor(baseFontSize * (maxLabelWidth / measuredWidth)));
          ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
        }
      }

      ctx.fillText(label, centerX, y);
    };

    data.forEach((item, index) => {
      const barHeight = (item.value / max) * chartHeight;
      const x = padding.left + index * (barWidth + gap) + gap / 2;
      const y = padding.top + chartHeight - barHeight;

      const gradient = ctx.createLinearGradient(x, y, x, padding.top + chartHeight);
      gradient.addColorStop(0, item.color);
      gradient.addColorStop(1, item.color + '40');

      const radius = 4;
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + barWidth - radius, y);
      ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
      ctx.lineTo(x + barWidth, padding.top + chartHeight);
      ctx.lineTo(x, padding.top + chartHeight);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.fillStyle = theme === 'light' ? '#64748b' : '#94a3b8';
      ctx.textAlign = 'center';
      drawLabel(item.label, x + barWidth / 2, padding.top + chartHeight + 20);

      ctx.font = '11px Inter, system-ui, sans-serif';
      ctx.fillStyle = theme === 'light' ? '#0f172a' : '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(item.value.toFixed(0), x + barWidth / 2, y - 8);
    });

    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top + chartHeight);
    ctx.lineTo(width - padding.right, padding.top + chartHeight);
    ctx.strokeStyle = theme === 'light' ? 'rgba(148, 163, 184, 0.55)' : 'rgba(51, 65, 85, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [data, height, maxValue, fitLabels, theme]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full"
      style={{ height }}
    />
  );
}
