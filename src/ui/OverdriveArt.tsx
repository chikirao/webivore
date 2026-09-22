/** Editable, resolution-independent chrome. Character artwork remains raster. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`wordmark ${className}`}
      viewBox="0 0 1050 250"
      role="img"
      aria-label="WEBIVORE"
    >
      <path
        d="M0 61 40 16H83L96 3H602L623 30H960L1050 248H856L823 216H356L322 233H160L139 212H0Z"
        fill="var(--ink)"
      />
      <path
        d="M0 95 58 39H603L599 55H915L875 192H346L315 221H159L140 202H0"
        fill="none"
        stroke="white"
        strokeWidth="8"
      />
      <text
        x="-9"
        y="172"
        textLength="842"
        lengthAdjust="spacingAndGlyphs"
        className="wordmark-text"
      >
        WEBIVORE
      </text>
      <path
        d="M210 186h33l-32 32h-33z M260 186h33l-32 32h-33z M310 186h33l-32 32h-33z"
        fill="var(--red)"
      />
      <path
        d="M640 10h148 M37 228h95"
        stroke="var(--ink)"
        strokeWidth="7"
        strokeDasharray="10 9"
      />
    </svg>
  );
}
export function ArrowArt({ input = true }: { input?: boolean }) {
  return (
    <svg
      className="arrow-art"
      viewBox="0 0 1010 290"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M51 57H620L635 66H828L816 14H859L1000 151 1000 166 861 287 818 258H765V230H49L8 190V110Z"
        fill="var(--ink)"
      />
      <path
        d="M55 68H623L635 77H843L830 26H855L987 156 861 273 827 246H778V219H53L20 186V114Z"
        fill="var(--red)"
        stroke="white"
        strokeWidth="6"
      />
      {input && (
        <path
          d="M94 85H607L669 151 607 215H55L27 185V123Z"
          fill="white"
          stroke="var(--ink)"
          strokeWidth="5"
        />
      )}
      <path
        d="M96 73 54 118H24 M72 231l-15 15 M90 231l-15 15 M110 231l-15 15"
        fill="none"
        stroke="white"
        strokeWidth="6"
      />
      <path d="M836 40 962 157 M110 77H600" stroke="white" strokeWidth="3" />
    </svg>
  );
}
export function EntryGraphics() {
  return (
    <svg
      className="entry-graphics"
      viewBox="0 0 1536 1024"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <g fill="var(--red)">
        <path d="M1072 0h33l69 96-48-28 127 243h-50L1103 85z M1120 0h67l40 69-50-2z M1202 0h103l184 283-78-22 125 124v139l-133-141 81 173-55 7 75 90-90 113 76-8-70 82 91 37-49 11-112-92 27-51-90-248 75 45-56-112 76 67-102-161 64 4z" />
        <path d="M864 338h151l37 59-23 28-46-51-33 5z M884 367l102 38-40 7 65 129-18 66-90-153 26 6z M959 703l67 12-70 62 64-9-37 34-131 56 36-43-102 79z M1053 754l101 67-36 12-59-25 13 42-67 51 48-76z M1510 544l26 16v90l-44 25 24-81-31 6z" />
        <path d="M781 35h52l43 54-23 23h-51l23-23z M852 35h51l43 54-23 23h-51l23-23z M922 35h32l37 47-14 30h-35l23-23z" />
      </g>
      <g fill="var(--ink)">
        <path d="M1034 737l39 37-60-9-38 27-14-32z M1478 689l25-19-5 32-38 31z M1093 876l-29 44h85l7-12h-47l23-28z M1403 869l24 35h-24l-25-33z" />
      </g>
      <g fill="var(--red)">
        {Array.from({ length: 6 }, (_, i) =>
          Array.from({ length: 4 }, (_, j) => (
            <rect
              key={`${i}-${j}`}
              x={1437 + i * 15}
              y={126 + j * 16}
              width="7"
              height="7"
            />
          )),
        )}
      </g>
      <g fill="var(--red)" transform="translate(925 833) skewX(-20)">
        {Array.from({ length: 7 }, (_, i) =>
          Array.from({ length: 5 }, (_, j) => (
            <rect
              key={`${i}-${j}`}
              x={i * 16}
              y={j * 16}
              width="7"
              height="7"
            />
          )),
        )}
      </g>
      <g stroke="white" strokeWidth="25" strokeLinecap="round">
        <path d="M1287 132l54 45m-3-56-42 62 M1388 124l6 34m-20-16 40-6" />
      </g>
      <g stroke="var(--ink)" strokeWidth="15" strokeLinecap="round">
        <path d="M1287 132l54 45m-3-56-42 62 M1388 124l6 34m-20-16 40-6" />
      </g>
      <path
        d="M135 480H252L319 423H627L690 485H828"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="13"
      />
    </svg>
  );
}
