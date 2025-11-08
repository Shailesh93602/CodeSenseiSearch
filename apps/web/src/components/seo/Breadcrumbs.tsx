import Link from 'next/link';
import { BreadcrumbStructuredData } from './StructuredData';

interface BreadcrumbItem {
  name: string;
  href: string;
  current?: boolean;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className = '' }: BreadcrumbsProps) {
  const breadcrumbsForStructuredData = items.map(item => ({
    name: item.name,
    url: `https://codesenseisearch.com${item.href}`,
  }));

  return (
    <>
      <BreadcrumbStructuredData breadcrumbs={breadcrumbsForStructuredData} />
      <nav className={`flex ${className}`} aria-label="Breadcrumb">
        <ol className="flex items-center space-x-2">
          {items.map((item, index) => (
            <li key={item.href} className="flex items-center">
              {index > 0 && (
                <span 
                  className="text-gray-400 mx-2" 
                  aria-hidden="true"
                >
                  →
                </span>
              )}
              {item.current ? (
                <span 
                  className="text-gray-500 font-medium" 
                  aria-current="page"
                >
                  {item.name}
                </span>
              ) : (
                <Link 
                  href={item.href}
                  className="text-blue-600 hover:text-blue-800 font-medium transition-colors"
                >
                  {item.name}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}