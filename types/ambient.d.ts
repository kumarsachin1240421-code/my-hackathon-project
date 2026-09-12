// CareWell Ambient Type Definitions for TypeScript IDE Language Server
declare var process: {
  env: Record<string, string | undefined>;
};

declare namespace React {
  type ReactNode = any;
  type FC<P = {}> = (props: P) => any;
  function useState<T>(initialState: T | (() => T)): [T, (val: T | ((prev: T) => T)) => void];
  function useEffect(effect: () => void | (() => void), deps?: readonly any[]): void;
  function useRef<T>(initialValue: T | null): { current: T | null };
  function useRef<T = undefined>(): { current: T | undefined };
  function useCallback<T extends (...args: any[]) => any>(callback: T, deps: readonly any[]): T;
  function useMemo<T>(factory: () => T, deps: readonly any[] | undefined): T;

  interface ChangeEvent<T = any> {
    target: T;
    currentTarget: T;
    preventDefault(): void;
    stopPropagation(): void;
  }
  interface FormEvent<T = any> {
    target: T;
    currentTarget: T;
    preventDefault(): void;
    stopPropagation(): void;
  }
  interface KeyboardEvent<T = any> {
    key: string;
    code: string;
    preventDefault(): void;
    stopPropagation(): void;
  }
  interface MouseEvent<T = any> {
    preventDefault(): void;
    stopPropagation(): void;
  }
}

declare module 'react' {
  export = React;
  export as namespace React;
}

declare module 'react/jsx-runtime' {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}

declare module 'next' {
  export interface Metadata {
    title?: string;
    description?: string;
    manifest?: string;
    themeColor?: string;
    icons?: any;
    [key: string]: any;
  }
  export interface Viewport {
    themeColor?: string;
    width?: string;
    initialScale?: number;
    [key: string]: any;
  }
  export namespace MetadataRoute {
    export interface Manifest {
      [key: string]: any;
    }
  }
}

declare module 'next/server' {
  export class NextRequest extends Request {}
  export class NextResponse extends Response {
    static json(body: any, init?: ResponseInit): NextResponse;
    static redirect(url: string | URL, status?: number): NextResponse;
    static next(): NextResponse;
  }
}

declare module 'twilio' {
  interface TwilioCall {
    sid: string;
  }
  interface TwilioMessage {
    sid: string;
  }
  interface TwilioClient {
    calls: {
      create(opts: any): Promise<TwilioCall>;
    };
    messages: {
      create(opts: any): Promise<TwilioMessage>;
    };
  }
  function twilio(accountSid?: string, authToken?: string): TwilioClient;
  export default twilio;
}

declare module 'leaflet' {
  const L: any;
  export default L;
}

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
  interface Element extends React.ReactNode {}
}

interface RequestInit {
  next?: {
    revalidate?: number | false;
    tags?: string[];
  };
}
