import React, { useEffect, useRef } from 'react';
import { VideoOff } from 'lucide-react';

interface PlayerAvatar2DProps {
  seatIndex: number;
  name: string;
  teamSide: 'A' | 'B';
  camOn: boolean;
  stream?: MediaStream;
  isLocal?: boolean;
  sizeClass?: string;
}

const AVATAR_PALETTES = [
  {
    bgFrom: '#1C4D36',
    bgTo: '#0A1E15',
    skin: '#C68B59',
    skinShade: '#A26B3E',
    shirt: '#F4EFE4',
    hair: '#1D1612',
    hat: '#E5D5B5',
    hatBand: '#B45309',
    style: 'panama' as const,
  },
  {
    bgFrom: '#1D3557',
    bgTo: '#0D1829',
    skin: '#D9A57E',
    skinShade: '#B67F58',
    shirt: '#2563EB',
    hair: '#221712',
    hat: '#1E293B',
    hatBand: '#60A5FA',
    style: 'glasses' as const,
  },
  {
    bgFrom: '#145338',
    bgTo: '#092418',
    skin: '#9A633C',
    skinShade: '#764726',
    shirt: '#10B981',
    hair: '#18110E',
    hat: '#D9A841',
    hatBand: '#065F46',
    style: 'curls' as const,
  },
  {
    bgFrom: '#581C28',
    bgTo: '#220B10',
    skin: '#E2B38F',
    skinShade: '#BC8862',
    shirt: '#991B1B',
    hair: '#2B1D16',
    hat: '#374151',
    hatBand: '#FCA5A5',
    style: 'cap' as const,
  },
];

export const PlayerAvatar2D: React.FC<PlayerAvatar2DProps> = ({
  seatIndex,
  name,
  teamSide,
  camOn,
  stream,
  isLocal = false,
  sizeClass = 'w-11 h-11 sm:w-14 sm:h-14',
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hasLiveVideo = Boolean(
    stream && stream.getVideoTracks().some((t) => t.enabled && t.readyState === 'live')
  );

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = hasLiveVideo && stream ? stream : null;
    }
  }, [stream, hasLiveVideo]);

  const pal = AVATAR_PALETTES[Math.abs(seatIndex) % AVATAR_PALETTES.length];

  return (
    <div
      className={`relative rounded-xl overflow-hidden border-2 shrink-0 flex items-center justify-center shadow-inner ${
        teamSide === 'A' ? 'border-emerald-400/60' : 'border-rose-400/60'
      } ${sizeClass}`}
      style={{
        background: `radial-gradient(circle at 50% 30%, ${pal.bgFrom}, ${pal.bgTo})`,
      }}
      title={name}
    >
      {hasLiveVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={`w-full h-full object-cover ${isLocal ? 'scale-x-[-1]' : ''}`}
        />
      ) : (
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {/* Curly hair back layer for style 'curls' */}
          {pal.style === 'curls' && (
            <g fill={pal.hair}>
              <circle cx="26" cy="40" r="14" />
              <circle cx="74" cy="40" r="14" />
              <circle cx="32" cy="24" r="14" />
              <circle cx="68" cy="24" r="14" />
              <circle cx="50" cy="18" r="15" />
            </g>
          )}

          {/* Shoulders & Guayabera Shirt */}
          <path
            d="M14,102 C16,78 30,72 50,72 C70,72 84,78 86,102 Z"
            fill={pal.shirt}
          />
          {/* V-collar */}
          <path d="M40,72 L50,86 L60,72 Z" fill={pal.skinShade} />
          {/* Neck */}
          <rect x="42" y="60" width="16" height="16" rx="6" fill={pal.skinShade} />

          {/* Ears */}
          <ellipse cx="28" cy="48" rx="4.5" ry="7" fill={pal.skinShade} />
          <ellipse cx="72" cy="48" rx="4.5" ry="7" fill={pal.skinShade} />

          {/* Gold hoop earrings for 'curls' */}
          {pal.style === 'curls' && (
            <g fill="none" stroke="#FBBF24" strokeWidth="2.2">
              <circle cx="27" cy="56" r="4.5" />
              <circle cx="73" cy="56" r="4.5" />
            </g>
          )}

          {/* Head */}
          <ellipse cx="50" cy="46" rx="22" ry="25" fill={pal.skin} />

          {/* Hairline (non-hat styles) */}
          {pal.style === 'glasses' && (
            <path
              d="M28,40 C28,22 72,22 72,40 C66,30 34,30 28,40 Z"
              fill={pal.hair}
            />
          )}

          {/* Eyes */}
          <g>
            <ellipse cx="41" cy="45" rx="3.4" ry="3.2" fill="#FFFFFF" />
            <ellipse cx="59" cy="45" rx="3.4" ry="3.2" fill="#FFFFFF" />
            <circle cx="41.2" cy="45" r="2.1" fill="#1E140E" />
            <circle cx="59.2" cy="45" r="2.1" fill="#1E140E" />
            <circle cx="40.5" cy="44.2" r="0.8" fill="#FFFFFF" />
            <circle cx="58.5" cy="44.2" r="0.8" fill="#FFFFFF" />
            {/* Eyebrows */}
            <path d="M36,39 Q41,37 45,39" stroke={pal.hair} strokeWidth="2.2" fill="none" strokeLinecap="round" />
            <path d="M55,39 Q59,37 64,39" stroke={pal.hair} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          </g>

          {/* Nose & Warm Smile */}
          <path d="M50,46 L49,53 L52,54" stroke={pal.skinShade} strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <path d="M42,59 Q50,65 58,59" stroke="#7C2D12" strokeWidth="2.4" fill="none" strokeLinecap="round" />

          {/* Glasses & trimmed beard for style 'glasses' */}
          {pal.style === 'glasses' && (
            <>
              <g fill="none" stroke="#F59E0B" strokeWidth="2">
                <rect x="34" y="40" width="13" height="10" rx="3" />
                <rect x="53" y="40" width="13" height="10" rx="3" />
                <line x1="47" y1="45" x2="53" y2="45" />
              </g>
              <path
                d="M32,56 C35,69 65,69 68,56 C62,64 38,64 32,56 Z"
                fill={pal.hair}
                opacity="0.55"
              />
            </>
          )}

          {/* Classic mustache for style 'cap' */}
          {pal.style === 'cap' && (
            <path
              d="M42,57 Q50,53 58,57"
              stroke={pal.hair}
              strokeWidth="3.2"
              fill="none"
              strokeLinecap="round"
            />
          )}

          {/* Hats */}
          {pal.style === 'panama' && (
            <g>
              <ellipse cx="50" cy="27" rx="33" ry="6" fill={pal.hat} />
              <path d="M31,26 L35,10 Q50,7 65,10 L69,26 Z" fill={pal.hat} />
              <rect x="32.5" y="21" width="35" height="4" rx="1" fill={pal.hatBand} />
            </g>
          )}
          {pal.style === 'cap' && (
            <g>
              <path d="M26,31 C26,15 74,15 74,31 Z" fill={pal.hat} />
              <path d="M25,30 Q52,26 80,33 Q52,33 25,30 Z" fill="#1F2937" />
            </g>
          )}
        </svg>
      )}
      {!hasLiveVideo && !camOn && (
        <span className="sr-only">
          <VideoOff />
        </span>
      )}
    </div>
  );
};
