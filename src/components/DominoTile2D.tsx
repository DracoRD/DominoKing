import React from 'react';
import { DominoTile } from '../shared/dominoEngine';

interface DominoTile2DProps {
  tile: DominoTile;
  playable: boolean;
  selected: boolean;
  onClick: () => void;
}

const PIP_COORDS: Record<number, Array<[number, number]>> = {
  0: [],
  1: [[50, 50]],
  2: [
    [25, 25],
    [75, 75],
  ],
  3: [
    [24, 24],
    [50, 50],
    [76, 76],
  ],
  4: [
    [25, 25],
    [75, 25],
    [25, 75],
    [75, 75],
  ],
  5: [
    [24, 24],
    [76, 24],
    [50, 50],
    [24, 76],
    [76, 76],
  ],
  6: [
    [27, 21],
    [73, 21],
    [27, 50],
    [73, 50],
    [27, 79],
    [73, 79],
  ],
};

// Classic high-contrast white & black domino pips
const HalfPips: React.FC<{ value: number }> = ({ value }) => (
  <svg viewBox="0 0 100 100" className="w-full h-full">
    {(PIP_COORDS[value] || []).map(([cx, cy], idx) => (
      <g key={idx}>
        <circle cx={cx} cy={cy - 1.1} r={14.2} fill="rgba(0,0,0,0.22)" />
        <circle cx={cx} cy={cy} r={13} fill="#0D0D0F" />
        <circle cx={cx - 3.2} cy={cy - 3.2} r={2.8} fill="rgba(255,255,255,0.22)" />
      </g>
    ))}
  </svg>
);

export const DominoTile2D: React.FC<DominoTile2DProps> = ({
  tile,
  playable,
  selected,
  onClick,
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!playable}
      aria-label={`Ficha ${tile.a}-${tile.b}`}
      className={`relative flex flex-col items-center justify-between w-11 h-[74px] sm:w-[52px] sm:h-[92px] rounded-xl p-1.5 border border-b-[5px] transition-transform duration-150 select-none shrink-0 ${
        selected
          ? 'bg-gradient-to-b from-[#FFFFFF] to-[#F3F3F0] border-[#EAA938] border-b-[#B7791F] -translate-y-3 ring-2 ring-[#EAA938] shadow-[0_12px_26px_rgba(234,169,56,0.48)]'
          : playable
          ? 'bg-gradient-to-b from-[#FFFFFF] to-[#F1F1EE] border-[#262626] border-b-[#0B0B0D] -translate-y-1 hover:-translate-y-2.5 active:scale-95 cursor-pointer shadow-[0_10px_22px_rgba(0,0,0,0.62)]'
          : 'bg-[#D4D4D8]/80 border-[#3F3F46] border-b-[#18181B] opacity-55 cursor-not-allowed shadow-md'
      }`}
    >
      <div className="w-full h-[46%]">
        <HalfPips value={tile.a} />
      </div>

      {/* Classic black center divider & pin */}
      <div className="w-4/5 h-[2.5px] rounded-full bg-[#111113] flex items-center justify-center relative">
        <span className="w-2 h-2 rounded-full bg-[#111113] border border-white/60" />
      </div>

      <div className="w-full h-[46%]">
        <HalfPips value={tile.b} />
      </div>
    </button>
  );
};
