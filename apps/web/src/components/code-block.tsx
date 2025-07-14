"use client";

import { useEffect } from "react";
import Prism from "prismjs";

// Import specific languages
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-go";
import "prismjs/components/prism-css";
import "prismjs/components/prism-json";
import "prismjs/components/prism-bash";

interface CodeBlockProps {
  code: string;
  language: string;
  fileName?: string;
  showLineNumbers?: boolean;
}

export function CodeBlock({ code, language, fileName, showLineNumbers = false }: CodeBlockProps) {
  useEffect(() => {
    Prism.highlightAll();
  }, [code, language]);

  const languageMap: { [key: string]: string } = {
    javascript: "javascript",
    typescript: "typescript", 
    python: "python",
    go: "go",
    css: "css",
    json: "json",
    bash: "bash",
    shell: "bash"
  };

  const prismLanguage = languageMap[language] || "javascript";

  return (
    <div className="rounded-lg overflow-hidden bg-slate-900">
      {fileName && (
        <div className="flex items-center justify-between bg-slate-800 px-4 py-2 border-b border-slate-700">
          <span className="text-sm font-medium text-slate-300">{fileName}</span>
          <span className="text-xs text-slate-500 uppercase">{language}</span>
        </div>
      )}
      <div className="relative">
        <pre className={`language-${prismLanguage} ${showLineNumbers ? 'line-numbers' : ''} m-0 bg-slate-900 text-slate-100 p-4 text-sm overflow-x-auto`}>
          <code className={`language-${prismLanguage} text-sm`}>
            {code}
          </code>
        </pre>
      </div>
    </div>
  );
}