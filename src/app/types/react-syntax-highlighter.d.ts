declare module 'react-syntax-highlighter/dist/esm/prism-light' {
  import { ComponentType } from 'react';

  const PrismLight: ComponentType<any> & {
    registerLanguage?: (name: string, grammar: unknown) => void;
  };

  export default PrismLight;
}

declare module 'react-syntax-highlighter/dist/esm/styles/prism/one-light' {
  const style: Record<string, any>;
  export default style;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/javascript' {
  const grammar: unknown;
  export default grammar;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/typescript' {
  const grammar: unknown;
  export default grammar;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/python' {
  const grammar: unknown;
  export default grammar;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/bash' {
  const grammar: unknown;
  export default grammar;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/json' {
  const grammar: unknown;
  export default grammar;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/markdown' {
  const grammar: unknown;
  export default grammar;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/css' {
  const grammar: unknown;
  export default grammar;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/sql' {
  const grammar: unknown;
  export default grammar;
}
