# Phase 1: Landing Page + Search UI (Public Demo)

**Goal**: Create a public-facing demo with landing page and functional search UI using mocked results

**Timeline**: 5-7 days  
**Status**: 🚧 In Progress  
**Priority**: P0 (Critical Path)

---

## Acceptance Criteria

✅ **Must Have**:
- [ ] Professional landing page with clear value proposition
- [ ] Functional search interface with real-time suggestions
- [ ] Search results page with syntax-highlighted code snippets
- [ ] Responsive design working on mobile and desktop
- [ ] Mocked search results that feel realistic and relevant

🎯 **Success Metrics**:
- [ ] Landing page loads in <2 seconds
- [ ] Search interface responds to input within 200ms
- [ ] At least 20 realistic mock results for various queries
- [ ] Mobile-responsive design tested on different screen sizes
- [ ] Clean, professional UI that showcases the product vision

---

## Task Breakdown

### 1. Install Dependencies & Setup UI Components
**Estimate**: 2-3 hours

- [ ] **Install missing frontend dependencies**
  - [ ] Install shadcn/ui dependencies (`pnpm --filter web add clsx tailwind-merge`)
  - [ ] Install Monaco Editor or Prism.js for syntax highlighting
  - [ ] Install React Query for state management
  - [ ] Install React Hook Form for search form handling
  - [ ] Install Framer Motion for animations (optional)

- [ ] **Setup shadcn/ui components**
  - [ ] Install Button, Input, Card, Badge, Tabs components
  - [ ] Install Dialog, Command, Separator components
  - [ ] Test component imports and ensure proper Tailwind setup
  - [ ] Create component library structure

- [ ] **Configure Monaco Editor/Prism.js**
  - [ ] Add syntax highlighting for JavaScript, TypeScript, Python, Go, Rust
  - [ ] Configure themes (light/dark mode support)
  - [ ] Test code snippet rendering

### 2. Create Landing Page Design
**Estimate**: 6-8 hours

- [ ] **Hero Section**
  - [ ] Compelling headline: "AI-Powered Search for Developer Content"
  - [ ] Subheading explaining the value proposition
  - [ ] Prominent search bar with placeholder example
  - [ ] Call-to-action button ("Try Search" / "Get Started")
  - [ ] Hero illustration or screenshot

- [ ] **Features Section**
  - [ ] "Semantic Search" - Find code by meaning, not just keywords
  - [ ] "Multi-Source" - GitHub repos, StackOverflow, documentation
  - [ ] "Smart Filtering" - By language, repo, date, relevance
  - [ ] "Syntax Highlighting" - Beautiful code preview with context
  - [ ] Use icons and clear descriptions

- [ ] **How It Works Section**
  - [ ] 3-step process: "Search → Filter → Explore"
  - [ ] Visual flow diagram or illustrations
  - [ ] Example search query with results preview

- [ ] **Footer**
  - [ ] Links to GitHub repository
  - [ ] Contact information
  - [ ] Tech stack credits
  - [ ] Privacy and terms placeholders

### 3. Build Search Interface
**Estimate**: 8-10 hours

- [ ] **Search Input Component**
  - [ ] Real-time search suggestions as user types
  - [ ] Debounced input to avoid excessive API calls
  - [ ] Search history (stored in localStorage)
  - [ ] Auto-complete with popular queries
  - [ ] Keyboard navigation (arrow keys, enter, escape)

- [ ] **Search Filters Sidebar**
  - [ ] Language filter (JavaScript, Python, TypeScript, etc.)
  - [ ] Source filter (GitHub, StackOverflow, Docs)
  - [ ] Date range filter (Last day, week, month, year)
  - [ ] Repository filter (for GitHub results)
  - [ ] Sort by relevance, date, popularity

- [ ] **Search Results Layout**
  - [ ] Results count and search time display
  - [ ] Pagination or infinite scroll
  - [ ] Grid/list view toggle
  - [ ] Loading states with skeleton components
  - [ ] Empty state when no results found

### 4. Design Search Results Cards
**Estimate**: 6-8 hours

- [ ] **Result Card Components**
  - [ ] Title with source repository/document link
  - [ ] Code snippet preview with syntax highlighting
  - [ ] Metadata (language, file path, last updated)
  - [ ] Relevance score or match indicators
  - [ ] Action buttons (Open in GitHub, Copy snippet, Save)

- [ ] **Code Snippet Display**
  - [ ] Syntax highlighting with line numbers
  - [ ] Highlighted search terms within code
  - [ ] Copy to clipboard functionality
  - [ ] Expand/collapse for longer snippets
  - [ ] Dark/light theme toggle

- [ ] **Interactive Features**
  - [ ] Hover effects and smooth transitions
  - [ ] Click to expand full code context
  - [ ] Quick preview modal for larger code blocks
  - [ ] Social sharing buttons (optional)

### 5. Create Realistic Mock Data
**Estimate**: 4-5 hours

- [ ] **Mock Search Results Dataset**
  - [ ] 50+ realistic code snippets from popular open-source projects
  - [ ] Include JavaScript, TypeScript, Python, Go, Rust examples
  - [ ] StackOverflow Q&A style results
  - [ ] Documentation snippet examples
  - [ ] Proper metadata (repo names, file paths, dates)

- [ ] **Mock Search API**
  - [ ] Create `/api/search` endpoint in NestJS backend
  - [ ] Return filtered and sorted mock results
  - [ ] Implement basic search logic (text matching)
  - [ ] Add artificial delay to simulate real search
  - [ ] Support query parameters (filters, pagination)

- [ ] **Search Suggestions Data**
  - [ ] Popular programming queries
  - [ ] Common coding problems and solutions
  - [ ] Framework-specific searches
  - [ ] Best practices and tutorial queries

### 6. Connect Frontend to Mock API
**Estimate**: 3-4 hours

- [ ] **API Integration**
  - [ ] Setup React Query for data fetching
  - [ ] Create search hooks and API client
  - [ ] Handle loading, error, and success states
  - [ ] Implement debounced search requests
  - [ ] Add request cancellation for better UX

- [ ] **State Management**
  - [ ] Search query state management
  - [ ] Filter state (language, source, date)
  - [ ] Pagination state
  - [ ] Search history in localStorage
  - [ ] User preferences (theme, view mode)

### 7. Responsive Design & Polish
**Estimate**: 4-5 hours

- [ ] **Mobile Responsiveness**
  - [ ] Mobile-first design approach
  - [ ] Collapsible filter sidebar on mobile
  - [ ] Touch-friendly search interface
  - [ ] Optimized code snippet display for small screens
  - [ ] Test on iOS Safari and Android Chrome

- [ ] **Performance Optimization**
  - [ ] Lazy loading for code syntax highlighting
  - [ ] Image optimization for landing page
  - [ ] Bundle size optimization
  - [ ] Minimize initial page load time
  - [ ] Add loading animations

- [ ] **Accessibility**
  - [ ] Proper ARIA labels for search components
  - [ ] Keyboard navigation support
  - [ ] Screen reader compatibility
  - [ ] High contrast mode support
  - [ ] Focus management

### 8. Testing & Quality Assurance
**Estimate**: 2-3 hours

- [ ] **Frontend Testing**
  - [ ] Unit tests for search components
  - [ ] Integration tests for API calls
  - [ ] Visual regression tests (optional)
  - [ ] Cross-browser testing
  - [ ] Performance testing with Lighthouse

- [ ] **User Experience Testing**
  - [ ] Test search flow end-to-end
  - [ ] Verify all filter combinations work
  - [ ] Test responsive design on various devices
  - [ ] Validate accessibility features
  - [ ] Check error handling and edge cases

---

## Technical Implementation Notes

### Frontend Architecture
- **Components**: Modular React components with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui component library
- **State**: React Query for server state, useState/useReducer for local state
- **Routing**: Next.js App Router with dynamic search pages

### API Endpoints
```typescript
GET /api/search?q={query}&lang={language}&source={source}&page={page}
GET /api/search/suggestions?q={query}
GET /api/search/popular  // Popular searches
```

### File Structure Updates
```
apps/web/src/
├── app/
│   ├── search/page.tsx          # Search results page
│   └── page.tsx                 # Landing page
├── components/
│   ├── ui/                      # shadcn/ui components
│   ├── search/                  # Search-specific components
│   ├── landing/                 # Landing page components
│   └── layout/                  # Header, footer, navigation
├── hooks/                       # Custom React hooks
├── lib/
│   ├── api.ts                   # API client
│   └── mock-data.ts             # Mock search data
└── types/                       # Component-specific types
```

### Mock Data Structure
```typescript
interface MockSearchResult {
  id: string;
  title: string;
  code: string;
  language: string;
  source: 'github' | 'stackoverflow' | 'docs';
  repository?: string;
  path?: string;
  author?: string;
  lastUpdated: Date;
  score: number;
}
```

---

## Validation Checklist

Before marking Phase 1 complete:

- [ ] **Functionality Tests**
  - [ ] Landing page loads without errors
  - [ ] Search interface accepts input and returns results
  - [ ] Filters work and update results appropriately
  - [ ] Code syntax highlighting displays correctly
  - [ ] Mobile responsive design functions properly

- [ ] **Performance Tests**
  - [ ] Lighthouse score >90 for performance
  - [ ] First Contentful Paint <2 seconds
  - [ ] Search response time <500ms
  - [ ] No JavaScript errors in console
  - [ ] Proper error handling for network issues

- [ ] **User Experience Tests**
  - [ ] Navigation is intuitive and clear
  - [ ] Search results look realistic and helpful
  - [ ] Code snippets are readable and properly formatted
  - [ ] Call-to-action buttons are prominent and functional
  - [ ] Overall design is professional and polished

---

**Previous Phase**: Phase 0 - Project setup & scaffolding ✅  
**Next Phase**: Phase 2 - Content ingestion pipeline (GitHub + StackOverflow)

**Estimated Total Time**: 35-45 hours over 5-7 days