type IconProps = {
  size?: number;
  className?: string;
};

export function ClaudeCodeIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#D97757" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M4.714 15.956l4.718-2.648.079-.23-.08-.128h-.23l-.79-.048-2.695-.073-2.337-.097-2.265-.122-.57-.121-.535-.704.055-.353.48-.321.685.06 1.518.104 2.277.157 1.651.098 2.447.255h.389l.054-.158-.133-.097-.103-.098-2.356-1.596-2.55-1.688-1.336-.972-.722-.491L2 6.223l-.158-1.008.655-.722.88.06.225.061.893.686 1.906 1.476 2.49 1.833.364.304.146-.104.018-.072-.164-.274-1.354-2.446-1.445-2.49-.644-1.032-.17-.619a2.972 2.972 0 0 1-.103-.729L6.287.133 6.7 0l.995.134.42.364.619 1.415L9.735 4.14l1.555 3.03.455.898.243.832.09.255h.159V9.01l.127-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.583.28.48.685-.067.444-.286 1.851-.558 2.903-.365 1.942h.213l.243-.242.983-1.306 1.652-2.064.728-.82.85-.904.547-.431h1.032l.759 1.129-.34 1.166-1.063 1.347-.88 1.142-1.263 1.7-.79 1.36.074.11.188-.02 2.853-.606 1.542-.28 1.84-.315.832.388.09.395-.327.807-1.967.486-2.307.462-3.436.813-.043.03.049.061 1.548.146.662.036h1.62l3.018.225.79.522.473.638-.08.485-1.213.62-1.64-.389-3.825-.91-1.31-.329h-.183v.11l1.093 1.068 2.003 1.81 2.508 2.33.127.578-.321.455-.34-.049-2.204-1.657-.85-.747-1.925-1.62h-.127v.17l.443.649 2.343 3.521.122 1.08-.17.353-.607.213-.668-.122-1.372-1.924-1.415-2.168-1.141-1.943-.14.08-.674 7.254-.316.37-.728.28-.607-.461-.322-.747.322-1.476.388-1.924.316-1.53.285-1.9.17-.632-.012-.042-.14.018-1.432 1.967-2.18 2.945-1.724 1.845-.413.164-.716-.37.066-.662.401-.589 2.386-3.036 1.439-1.882.929-1.086-.006-.158h-.055L4.138 18.56l-1.13.146-.485-.456.06-.746.231-.243 1.907-1.312z" />
    </svg>
  );
}

export function CodexIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 260"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      preserveAspectRatio="xMidYMid"
    >
      <path
        fill="currentColor"
        d="M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803zM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256zm179.466 41.695l-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213zm21.742-32.69l-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205zM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697zm11.868-25.58L128.067 97.3l28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434z"
      />
    </svg>
  );
}

export function GeminiIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 296 298" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <mask id="gemini-mask" width="296" height="298" x="0" y="0" maskUnits="userSpaceOnUse" style={{ maskType: 'alpha' }}>
        <path
          fill="#3186FF"
          d="M141.201 4.886c2.282-6.17 11.042-6.071 13.184.148l5.985 17.37a184.004 184.004 0 0 0 111.257 113.049l19.304 6.997c6.143 2.227 6.156 10.91.02 13.155l-19.35 7.082a184.001 184.001 0 0 0-109.495 109.385l-7.573 20.629c-2.241 6.105-10.869 6.121-13.133.025l-7.908-21.296a184 184 0 0 0-109.02-108.658l-19.698-7.239c-6.102-2.243-6.118-10.867-.025-13.132l20.083-7.467A183.998 183.998 0 0 0 133.291 26.28l7.91-21.394z"
        />
      </mask>
      <g mask="url(#gemini-mask)">
        <ellipse cx="163" cy="149" fill="#3689FF" rx="196" ry="159" />
        <ellipse cx="33.5" cy="142.5" fill="#F6C013" rx="68.5" ry="72.5" />
        <ellipse cx="19.5" cy="148.5" fill="#F6C013" rx="68.5" ry="72.5" />
        <path fill="#FA4340" d="M194 10.5C172 82.5 65.5 134.333 22.5 135L144-66l50 76.5z" />
        <path fill="#FA4340" d="M190.5-12.5C168.5 59.5 62 111.333 19 112L140.5-89l50 76.5z" />
        <path fill="#14BB69" d="M194.5 279.5C172.5 207.5 66 155.667 23 155l121.5 201 50-76.5z" />
        <path fill="#14BB69" d="M196.5 320.5C174.5 248.5 68 196.667 25 196l121.5 201 50-76.5z" />
      </g>
    </svg>
  );
}

export function ZedIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <g clipPath="url(#zed-clip)">
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M9 6a3 3 0 0 0-3 3v66H0V9a9 9 0 0 1 9-9h80.379c4.009 0 6.016 4.847 3.182 7.682L43.055 57.187H57V51h6v7.688a4.5 4.5 0 0 1-4.5 4.5H37.055L26.743 73.5H73.5V36h6v37.5a6 6 0 0 1-6 6H20.743L10.243 90H87a3 3 0 0 0 3-3V21h6v66a9 9 0 0 1-9 9H6.621c-4.009 0-6.016-4.847-3.182-7.682L52.757 39H39v6h-6v-7.5a4.5 4.5 0 0 1 4.5-4.5h21.257l10.5-10.5H22.5V60h-6V22.5a6 6 0 0 1 6-6h52.757L85.757 6H9Z"
          clipRule="evenodd"
        />
      </g>
      <defs>
        <clipPath id="zed-clip">
          <path fill="#fff" d="M0 0h96v96H0z" />
        </clipPath>
      </defs>
    </svg>
  );
}

export function VscodeIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <mask id="vscode-mask" width="100" height="100" x="0" y="0" maskType="alpha" maskUnits="userSpaceOnUse">
        <path
          fill="#fff"
          fillRule="evenodd"
          d="M70.912 99.317a6.223 6.223 0 0 0 4.96-.19l20.589-9.907A6.25 6.25 0 0 0 100 83.587V16.413a6.25 6.25 0 0 0-3.54-5.632L75.874.874a6.226 6.226 0 0 0-7.104 1.21L29.355 38.04 12.187 25.01a4.162 4.162 0 0 0-5.318.236l-5.506 5.009a4.168 4.168 0 0 0-.004 6.162L16.247 50 1.36 63.583a4.168 4.168 0 0 0 .004 6.162l5.506 5.01a4.162 4.162 0 0 0 5.318.236l17.168-13.032L68.77 97.917a6.217 6.217 0 0 0 2.143 1.4ZM75.015 27.3 45.11 50l29.906 22.701V27.3Z"
          clipRule="evenodd"
        />
      </mask>
      <g mask="url(#vscode-mask)">
        <path
          fill="#0065A9"
          d="M96.461 10.796 75.857.876a6.23 6.23 0 0 0-7.107 1.207l-67.451 61.5a4.167 4.167 0 0 0 .004 6.162l5.51 5.009a4.167 4.167 0 0 0 5.32.236l81.228-61.62c2.725-2.067 6.639-.124 6.639 3.297v-.24a6.25 6.25 0 0 0-3.539-5.63Z"
        />
        <path
          fill="#007ACC"
          d="m96.461 89.204-20.604 9.92a6.229 6.229 0 0 1-7.107-1.207l-67.451-61.5a4.167 4.167 0 0 1 .004-6.162l5.51-5.009a4.167 4.167 0 0 1 5.32-.236l81.228 61.62c2.725 2.067 6.639.124 6.639-3.297v.24a6.25 6.25 0 0 1-3.539 5.63Z"
        />
        <path
          fill="#1F9CF0"
          d="M75.858 99.126a6.232 6.232 0 0 1-7.108-1.21c2.306 2.307 6.25.674 6.25-2.588V4.672c0-3.262-3.944-4.895-6.25-2.589a6.232 6.232 0 0 1 7.108-1.21l20.6 9.908A6.25 6.25 0 0 1 100 16.413v67.174a6.25 6.25 0 0 1-3.541 5.633l-20.601 9.906Z"
        />
      </g>
    </svg>
  );
}

export function CursorIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect width="512" height="512" rx="122" fill="#000" />
      <path d="M255.428 423l148.991-83.5L255.428 256l-148.99 83.5 148.99 83.5z" fill="url(#cursor-g0)" />
      <path d="M404.419 339.5v-167L255.428 89v167l148.991 83.5z" fill="url(#cursor-g1)" />
      <path d="M255.428 89l-148.99 83.5v167l148.99-83.5V89z" fill="url(#cursor-g2)" />
      <path d="M404.419 172.5L255.428 423V256l148.991-83.5z" fill="#E4E4E4" />
      <path d="M404.419 172.5L255.428 256l-148.99-83.5h297.981z" fill="#fff" />
      <defs>
        <linearGradient id="cursor-g0" x1="255.428" y1="256" x2="255.428" y2="423" gradientUnits="userSpaceOnUse">
          <stop offset=".16" stopColor="#fff" stopOpacity=".39" />
          <stop offset=".658" stopColor="#fff" stopOpacity=".8" />
        </linearGradient>
        <linearGradient id="cursor-g1" x1="404.419" y1="173.015" x2="257.482" y2="261.497" gradientUnits="userSpaceOnUse">
          <stop offset=".182" stopColor="#fff" stopOpacity=".31" />
          <stop offset=".715" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="cursor-g2" x1="255.428" y1="89" x2="112.292" y2="342.802" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity=".6" />
          <stop offset=".667" stopColor="#fff" stopOpacity=".22" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function WindsurfIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect width="24" height="24" rx="5" fill="#0D9373" />
      <path d="M6 7c3 0 5 2.5 6 5-1-1.5-3-2.5-6-2.5V7zm0 5c3 0 5 2.5 6 5-1-1.5-3-2.5-6-2.5V12z" fill="#fff" />
    </svg>
  );
}

export function FinderIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="finder-a" x2="0" y1="100%">
          <stop offset="0" stopColor="#1e73f2" />
          <stop offset="1" stopColor="#19d3fd" />
        </linearGradient>
        <linearGradient id="finder-b" x2="0" y1="100%">
          <stop offset="0" stopColor="#dbe9f4" />
          <stop offset="1" stopColor="#f7f6f6" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="15%" fill="url(#finder-a)" />
      <path
        fill="url(#finder-b)"
        d="M435.2 0H274.4c-21.2 49.2-59.2 129.6-60.8 283.4a9.9 9.9 0 0010 10.1h58.7a9.9 9.9 0 019.9 10.2A933.3 933.3 0 00311.3 512h123.9a76.8 76.8 0 0076.8-76.8V76.8A76.8 76.8 0 00435.2 0z"
      />
      <path
        fill="none"
        stroke="#000"
        strokeLinecap="round"
        strokeWidth="20"
        d="M371 149v34m-229-34v34m263.4 147.2a215.2 215.2 0 01-298.8 0"
      />
    </svg>
  );
}

export function ITermIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="iterm-g" x1="512" y1="100" x2="512" y2="924" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D4E6E8" />
          <stop offset="1" stopColor="#767573" />
        </linearGradient>
      </defs>
      <rect x="100" y="100" width="824" height="824" rx="179" fill="url(#iterm-g)" />
      <rect x="121.788" y="121.789" width="780.423" height="780.423" rx="156" fill="#000" />
      <rect x="183.192" y="183.192" width="657.615" height="657.615" rx="94" fill="#202A2F" />
      <path fill="#0EE827" fillOpacity=".35" d="M367.404 226.769h89.135v178.269h-89.135z" />
      <path
        d="M274.468 374.622c-4.661-.395-9.03-1.054-13.108-1.977-3.933-1.055-7.574-2.175-10.924-3.361-3.204-1.187-6.044-2.307-8.52-3.362-2.33-1.186-4.078-2.109-5.243-2.768l9.394-17.4c1.019.659 2.767 1.581 5.243 2.768a231.703 231.703 0 0 0 8.302 3.757 120.146 120.146 0 0 0 9.831 3.163c3.35.923 6.481 1.385 9.394 1.385 14.565 0 21.847-5.471 21.847-16.412 0-2.637-.51-4.812-1.53-6.525-.873-1.714-2.257-3.164-4.15-4.35-1.748-1.319-3.933-2.439-6.554-3.362-2.476-1.054-5.316-2.109-8.521-3.163-6.117-2.11-11.578-4.285-16.385-6.526-4.66-2.372-8.666-5.009-12.015-7.909-3.35-2.9-5.899-6.195-7.647-9.886-1.747-3.691-2.621-7.91-2.621-12.655 0-3.691.801-7.25 2.403-10.678 1.602-3.427 3.859-6.459 6.772-9.095 2.913-2.768 6.409-5.075 10.487-6.921 4.078-1.977 8.593-3.361 13.545-4.152v-28.424h17.914v28.028c3.787.396 7.428.989 10.923 1.78 3.496.791 6.627 1.648 9.394 2.57 2.768.923 5.098 1.846 6.991 2.769 2.039.791 3.496 1.384 4.37 1.779l-8.739 16.214c-1.165-.527-2.84-1.186-5.025-1.977-2.039-.923-4.369-1.846-6.991-2.768-2.621-.923-5.461-1.714-8.52-2.373a43.446 43.446 0 0 0-9.175-.989c-4.952 0-9.395.923-13.327 2.768-3.787 1.714-5.68 4.68-5.68 8.898 0 2.637.51 5.01 1.529 7.119 1.165 1.977 2.767 3.757 4.806 5.338 2.185 1.582 4.807 3.098 7.865 4.548 3.204 1.318 6.846 2.637 10.924 3.955 5.388 1.977 10.195 4.02 14.418 6.13 4.224 2.109 7.792 4.481 10.705 7.118 2.913 2.636 5.098 5.668 6.554 9.095 1.602 3.428 2.403 7.448 2.403 12.062 0 3.955-.728 7.777-2.184 11.468-1.311 3.691-3.423 7.119-6.336 10.282-2.767 3.164-6.262 5.932-10.486 8.305-4.078 2.241-8.885 3.889-14.419 4.943v29.227h-17.914v-28.436z"
        fill="#0EE827"
      />
    </svg>
  );
}

export function GhosttyIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 27 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        fill="#3551F3"
        d="M20.395 32a6.35 6.35 0 0 1-3.516-1.067A6.355 6.355 0 0 1 13.362 32a6.351 6.351 0 0 1-3.516-1.067A6.265 6.265 0 0 1 6.372 32h-.038a6.255 6.255 0 0 1-4.5-1.906 6.377 6.377 0 0 1-1.836-4.482v-12.25C0 5.995 5.994 0 13.362 0c7.369 0 13.363 5.994 13.363 13.363v12.253c0 3.393-2.626 6.192-5.978 6.375a5.886 5.886 0 0 1-.352.009z"
      />
      <path
        fill="#000"
        d="M20.395 30.593a4.932 4.932 0 0 1-3.08-1.083.656.656 0 0 0-.42-.145.784.784 0 0 0-.487.176 4.939 4.939 0 0 1-3.046 1.055 4.939 4.939 0 0 1-3.045-1.055.751.751 0 0 0-.942 0 4.883 4.883 0 0 1-3.01 1.055h-.033a4.852 4.852 0 0 1-3.49-1.482 4.982 4.982 0 0 1-1.436-3.498V13.367c0-6.597 5.364-11.96 11.957-11.96 6.592 0 11.956 5.363 11.956 11.956v12.253c0 2.645-2.042 4.827-4.65 4.97a5.342 5.342 0 0 1-.274.007z"
      />
      <path
        fill="#fff"
        d="M23.912 13.363v12.253c0 1.876-1.447 3.463-3.32 3.566a3.503 3.503 0 0 1-2.398-.769c-.778-.626-1.873-.598-2.658.021a3.5 3.5 0 0 1-2.176.753 3.494 3.494 0 0 1-2.173-.753 2.153 2.153 0 0 0-2.684 0 3.498 3.498 0 0 1-2.15.753c-1.948.014-3.54-1.627-3.54-3.575v-12.25c0-5.825 4.724-10.549 10.55-10.549 5.825 0 10.549 4.724 10.549 10.55z"
      />
      <path
        fill="#000"
        d="M11.28 12.437l-3.93-2.27a1.072 1.072 0 0 0-1.463.392 1.072 1.072 0 0 0 .391 1.463l2.326 1.343-2.326 1.343a1.072 1.072 0 0 0 1.071 1.855l3.932-2.27a1.071 1.071 0 0 0 0-1.854v-.002zm8.902-.146h-5.164a1.071 1.071 0 1 0 0 2.143h5.164a1.071 1.071 0 1 0 0-2.143z"
      />
    </svg>
  );
}

export function TerminalAppIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        fill="currentColor"
        d="M432 32H80a64.07 64.07 0 0 0-64 64v320a64.07 64.07 0 0 0 64 64h352a64.07 64.07 0 0 0 64-64V96a64.07 64.07 0 0 0-64-64zM96 256a16 16 0 0 1-10-28.49L150.39 176 86 124.49a16 16 0 1 1 20-25l80 64a16 16 0 0 1 0 25l-80 64A16 16 0 0 1 96 256zm160 0h-64a16 16 0 0 1 0-32h64a16 16 0 0 1 0 32z"
      />
    </svg>
  );
}

export function IntelliJIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid"
      className={className}
    >
      <defs>
        <linearGradient x1="37%" y1="51%" x2="178.1%" y2="41.9%" id="ij-a">
          <stop stopColor="#FC801D" offset="9%" />
          <stop stopColor="#B07F61" offset="23%" />
          <stop stopColor="#577DB3" offset="41%" />
          <stop stopColor="#1E7CE6" offset="53%" />
          <stop stopColor="#087CFA" offset="59%" />
        </linearGradient>
        <linearGradient x1="73.6%" y1="114.8%" x2="35.6%" y2="1.1%" id="ij-b">
          <stop stopColor="#FE2857" offset="0%" />
          <stop stopColor="#CB3979" offset="8%" />
          <stop stopColor="#9E4997" offset="16%" />
          <stop stopColor="#7557B2" offset="25%" />
          <stop stopColor="#5362C8" offset="34%" />
          <stop stopColor="#386CDA" offset="44%" />
          <stop stopColor="#2373E8" offset="54%" />
          <stop stopColor="#1478F2" offset="66%" />
          <stop stopColor="#0B7BF8" offset="79%" />
          <stop stopColor="#087CFA" offset="100%" />
        </linearGradient>
        <linearGradient x1="28.6%" y1="23.6%" x2="81.8%" y2="129.8%" id="ij-c">
          <stop stopColor="#FE2857" offset="0%" />
          <stop stopColor="#FE295F" offset="8%" />
          <stop stopColor="#FF2D76" offset="21%" />
          <stop stopColor="#FF318C" offset="30%" />
          <stop stopColor="#EA3896" offset="38%" />
          <stop stopColor="#B248AE" offset="55%" />
          <stop stopColor="#5A63D6" offset="79%" />
          <stop stopColor="#087CFA" offset="100%" />
        </linearGradient>
      </defs>
      <path fill="url(#ij-a)" d="M40.5 180.6L2.9 150.8l22.1-41 33.3 11.1z" />
      <path fill="#087CFA" d="M256 68.2l-4.6 148.3-98.6 39.5-53.7-34.7z" />
      <path fill="url(#ij-b)" d="M256 68.2l-48.8 47.6L144.5 39l31-34.8z" />
      <path fill="url(#ij-c)" d="M99.1 221.3l-78.5 28.4 16.5-57.5 21.2-71.3L0 101.4 37.1 0l83.8 9.9 86.3 105.9z" />
      <path d="M49.1 48h160v160h-160z" />
      <path
        d="M69 177.8h60v10H69v-10zM99 79V68H69.2v11h8.4v37.7h-8.4v11H99v-11h-8.3V79H99zm28.5 49.4l.2.1c-4.1.2-8.1-.8-11.8-2.6a27 27 0 0 1-7.7-6.3l8.2-9.2c1.5 1.7 3.2 3.1 5.2 4.3 1.7 1.1 3.7 1.7 5.7 1.6 2.2.2 4.3-.7 5.8-2.3a11 11 0 0 0 2.2-7.5V68h13.3v39a27 27 0 0 1-1.5 9.4c-1.7 5-5.7 9-10.8 10.6-2.8 1-5.8 1.5-8.8 1.4z"
        fill="#FFF"
      />
    </svg>
  );
}

/** Lookup function: returns the right icon for an agent preset */
export function agentPresetIcon(presetId: string, size = 15) {
  switch (presetId) {
    case 'claude':
      return <ClaudeCodeIcon size={size} />;
    case 'codex':
      return <CodexIcon size={size} />;
    case 'gemini':
      return <GeminiIcon size={size} />;
    default:
      return null;
  }
}

/** Lookup function: returns the right icon for a detected IDE */
export function ideIcon(ideId: string, size = 15) {
  switch (ideId) {
    case 'zed':
      return <ZedIcon size={size} />;
    case 'vscode':
      return <VscodeIcon size={size} />;
    case 'cursor':
      return <CursorIcon size={size} />;
    case 'windsurf':
      return <WindsurfIcon size={size} />;
    case 'intellij':
      return <IntelliJIcon size={size} />;
    default:
      return null;
  }
}

/** Lookup function: returns the right icon for an app (Finder, terminals, etc.) */
export function appIcon(appId: string, size = 15) {
  switch (appId) {
    case 'finder':
      return <FinderIcon size={size} />;
    case 'iterm':
    case 'iterm2':
      return <ITermIcon size={size} />;
    case 'ghostty':
      return <GhosttyIcon size={size} />;
    case 'terminal':
    case 'wezterm':
      return <TerminalAppIcon size={size} />;
    default:
      return null;
  }
}
