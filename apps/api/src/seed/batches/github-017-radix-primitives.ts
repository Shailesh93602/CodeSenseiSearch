/**
 * Batch github-017-radix-primitives
 *
 * 25 patterns drawn from the actual source of radix-ui/primitives
 * (the React primitives that ship under `@radix-ui/react-*`).
 * Each entry attributes to a real file in the repo. The `url`
 * always resolves to the canonical file on `main`.
 *
 * Authoring rules (see CORPUS-PLAN.md):
 * - Real attribution; no fabricated URLs
 * - Real patterns the project actually implements
 * - 250-450 word body
 * - One topic per entry
 * - WHAT + HOW (real code) + WHY + non-obvious gotcha
 */

import type { SeedItem } from '../types';

const repo = { owner: 'radix-ui', name: 'primitives' };
const baseUrl = 'https://github.com/radix-ui/primitives/blob/main';

export const BATCH: SeedItem[] = [
  {
    title: 'Dialog modal: FocusScope + RemoveScroll + hideOthers stack three concerns',
    body: `\`Dialog\` in modal mode is the integration point for three independent libraries that, together, make a screen-reader-correct accessible dialog. The component file wires them up in a specific order that matters.

\`\`\`tsx
// DialogContentImpl
useFocusGuards(); // injects span guards at <body> edges

return (
  <FocusScope asChild loop trapped={trapFocus}
    onMountAutoFocus={onOpenAutoFocus}
    onUnmountAutoFocus={onCloseAutoFocus}>
    <DismissableLayer
      role="dialog"
      id={context.contentId}
      aria-describedby={context.descriptionId}
      aria-labelledby={context.titleId}
      onDismiss={() => context.onOpenChange(false)}
      ...
    />
  </FocusScope>
);
\`\`\`

The three concerns are: (1) **focus trap** via \`FocusScope\` with \`loop\` so Tab cycles back, (2) **scroll lock** via \`RemoveScroll\` mounted on the Overlay (uses the content as a \`shards={[contentRef]}\` so the overlay itself stays scrollable), (3) **aria-hide everything else** via \`aria-hidden\`'s \`hideOthers(content)\` called in an effect. \`hideOthers\` is the modern equivalent of \`aria-modal\` and works around the fact that screen readers don't agree on \`aria-modal\` semantics.

\`trapFocus\` is bound to \`context.open\`, not \`true\`. That distinction matters when the dialog has a close animation — \`open\` flips to false the instant the user clicks Close, but the DOM stays mounted via \`<Presence present={open}>\` until the animation finishes. If you trapped focus on \`true\` (a literal), Tab would still be locked inside the closing dialog. Binding to \`open\` releases the trap immediately so focus can return to the trigger via \`onCloseAutoFocus\`.

The non-obvious gotcha: \`onPointerDownOutside\` defaults to closing the dialog, but the modal variant intercepts right-clicks (\`event.button === 2\` or Ctrl+left-click on Mac) and prevents close — otherwise right-clicking inside the overlay (which counts as "outside" Content) would dismiss the dialog before the OS context menu appeared. \`onFocusOutside\` is also no-op'd because focus trap can still emit \`focusout\` while keeping focus inside.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['radix-ui', 'dialog', 'focus-trap', 'scroll-lock', 'accessibility'],
    repository: repo,
    filePath: 'packages/react/dialog/src/dialog.tsx',
    url: `${baseUrl}/packages/react/dialog/src/dialog.tsx`,
  },
  {
    title: 'Collapsible: animated expand/collapse via CSS variables for measured size',
    body: `\`Collapsible\` is the building block under Accordion. It animates an open/close transition, but the height to animate to isn't known at write-time — it depends on the content. Radix measures the content during the transition and exposes the dimensions as CSS custom properties so consumers can write CSS that reads them.

\`\`\`tsx
// collapsible.tsx — CollapsibleContentImpl
useLayoutEffect(() => {
  const node = ref.current;
  if (node) {
    originalStylesRef.current = originalStylesRef.current || {
      transitionDuration: node.style.transitionDuration,
      animationName: node.style.animationName,
    };
    // block any animations/transitions so the element renders at its full dimensions
    node.style.transitionDuration = '0s';
    node.style.animationName = 'none';

    // get width and height from full dimensions
    const rect = node.getBoundingClientRect();
    heightRef.current = rect.height;
    widthRef.current = rect.width;

    // kick off any animations/transitions that were originally set up if it isn't the initial mount
    if (!isMountAnimationPreventedRef.current) {
      node.style.transitionDuration = originalStylesRef.current.transitionDuration!;
      node.style.animationName = originalStylesRef.current.animationName!;
    }
    setIsPresent(present);
  }
}, [context.open, present]);

return (
  <Primitive.div
    data-state={getState(context.open)}
    id={context.contentId}
    hidden={!isOpen}
    {...contentProps}
    ref={composedRefs}
    style={{
      [\`--radix-collapsible-content-height\` as any]: height ? \`\${height}px\` : undefined,
      [\`--radix-collapsible-content-width\` as any]: width ? \`\${width}px\` : undefined,
      ...props.style,
    }}>
    {isOpen && children}
  </Primitive.div>
);
\`\`\`

The dance: in a layoutEffect, before paint, temporarily disable transitions/animations, force the element to its natural height via \`getBoundingClientRect\`, capture that into a ref, then restore the original animation styles. The captured dimensions become \`--radix-collapsible-content-height/width\` CSS variables on the element.

Consumer CSS:

\`\`\`css
.collapsible-content[data-state='open'] {
  animation: slideDown 200ms ease-out;
}
.collapsible-content[data-state='closed'] {
  animation: slideUp 200ms ease-in;
}
@keyframes slideDown {
  from { height: 0; }
  to { height: var(--radix-collapsible-content-height); }
}
\`\`\`

Without the variable, you'd be stuck with \`height: auto\` (which doesn't animate) or hard-coded pixel heights (which break with dynamic content). The measure-then-restore pattern lets the animation run on a real numeric value.

\`isMountAnimationPreventedRef\` skips the measurement-restoration cycle on the very first mount so an already-open Collapsible doesn't animate in. Same trick as TabsContent.

Non-obvious gotcha: the temporary \`transitionDuration: '0s'\` is set, then \`getBoundingClientRect()\` is called. Reading layout forces a synchronous reflow — required, otherwise the browser might still report a partially-animated size. Restoring \`transitionDuration\` after that reflow re-enables the animation cleanly. If you change the inner content while open (toggling a sub-section), the height variable updates because \`useLayoutEffect\` re-runs whenever \`present\` or \`context.open\` changes.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['radix-ui', 'collapsible', 'animation', 'css-variables', 'getboundingclientrect'],
    repository: repo,
    filePath: 'packages/react/collapsible/src/collapsible.tsx',
    url: `${baseUrl}/packages/react/collapsible/src/collapsible.tsx`,
  },
  {
    title: 'Popover: anchor positioning via @floating-ui (fixed strategy + autoUpdate)',
    body: `Radix doesn't ship its own positioning math — it wraps \`@floating-ui/react-dom\`. The \`Popper\` primitive (used by Popover, DropdownMenu, Tooltip, ContextMenu, Select, HoverCard, Menubar) is the integration layer. The interesting part is the configuration that makes Floating UI behave the way Radix needs.

\`\`\`tsx
// packages/react/popper/src/popper.tsx — PopperContent
const { refs, floatingStyles, placement, isPositioned, middlewareData } = useFloating({
  // default to 'fixed' so users don't have to pick and we avoid focus scroll issues
  strategy: 'fixed',
  placement: desiredPlacement, // e.g. "bottom-start"
  whileElementsMounted: (...args) => autoUpdate(...args, {
    animationFrame: updatePositionStrategy === 'always',
  }),
  elements: { reference: context.anchor },
  middleware: [
    offset({ mainAxis: sideOffset + arrowHeight, alignmentAxis: alignOffset }),
    avoidCollisions && shift({
      mainAxis: true, crossAxis: false,
      limiter: sticky === 'partial' ? limitShift() : undefined,
      ...detectOverflowOptions,
    }),
    avoidCollisions && flip({ ...detectOverflowOptions }),
    size({
      ...detectOverflowOptions,
      apply: ({ availableWidth, availableHeight, rects }) => {
        contentStyle.setProperty('--radix-popper-available-width', \`\${availableWidth}px\`);
        contentStyle.setProperty('--radix-popper-available-height', \`\${availableHeight}px\`);
      },
    }),
    arrow && floatingUIarrow({ element: arrow, padding: arrowPadding }),
    transformOrigin({ arrowWidth, arrowHeight }),
    hideWhenDetached && hide({ strategy: 'referenceHidden', ...detectOverflowOptions }),
  ],
});
\`\`\`

\`strategy: 'fixed'\` is critical — it avoids the bug where focusing an input inside the popover scrolls the page (which would re-trigger position recalc and shift the popover).

The \`size\` middleware writes \`--radix-popper-available-width/height\` as CSS variables on the floating element. This is why you can write CSS like \`max-height: var(--radix-popover-content-available-height)\` and have the popover automatically shrink to fit when the viewport is small. Each consumer (Popover, Select, etc.) re-namespaces those vars to their own prefix.

Non-obvious gotcha: Radix passes \`isPositioned ? floatingStyles.transform : 'translate(0, -200%)'\`. While Floating UI is still measuring (first frame), the content sits 200% above the viewport so the user never sees it flash at the top-left of the page. \`isPositioned\` flips true after the first \`autoUpdate\` cycle resolves.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['radix-ui', 'popper', 'floating-ui', 'positioning', 'popover'],
    repository: repo,
    filePath: 'packages/react/popper/src/popper.tsx',
    url: `${baseUrl}/packages/react/popper/src/popper.tsx`,
  },
  {
    title: 'Toast: provider + viewport + portal, with hotkey-jumpable region landmark',
    body: `Toast is the most architecturally elaborate Radix primitive. There are three distinct elements: \`<ToastProvider>\` (state + duration), \`<ToastViewport>\` (the on-screen region), and individual \`<Toast>\` components portaled into the viewport.

\`\`\`tsx
// toast.tsx — ToastProvider
const ToastProvider: React.FC<ToastProviderProps> = (props) => {
  const {
    label = 'Notification',
    duration = 5000,
    swipeDirection = 'right',
    swipeThreshold = 50,
    children,
  } = props;
  const [viewport, setViewport] = React.useState<ToastViewportElement | null>(null);
  const [toastCount, setToastCount] = React.useState(0);
  const isFocusedToastEscapeKeyDownRef = React.useRef(false);
  const isClosePausedRef = React.useRef(false);

  if (!label.trim()) {
    console.error(\`Invalid prop \\\`label\\\` supplied to \\\`\${PROVIDER_NAME}\\\`. Expected non-empty \\\`string\\\`.\`);
  }

  return (
    <Collection.Provider scope={__scopeToast}>
      <ToastProviderProvider ...>
        {children}
      </ToastProviderProvider>
    </Collection.Provider>
  );
};
\`\`\`

The Viewport is rendered separately by the consumer (typically near the body root). It registers itself with the provider via context — the provider holds a *single* viewport reference, and \`<Toast>\` components portal their content into it.

\`\`\`tsx
// ToastViewport — F8 jump-to-region
React.useEffect(() => {
  const handleKeyDown = (event: KeyboardEvent) => {
    const isHotkeyPressed =
      hotkey.length !== 0 && hotkey.every((key) => (event as any)[key] || event.code === key);
    if (isHotkeyPressed) ref.current?.focus();
  };
  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, [hotkey]);
\`\`\`

The default hotkey is F8, modeled on Slack: pressing F8 anywhere in the app focuses the toast region so a keyboard user can read and interact with notifications without grabbing a mouse. The viewport renders \`role="region"\` with an \`aria-label\` like "Notifications (F8)" — the landmark + hotkey combo is announced to screen readers.

Pause-on-focus: when focus enters the wrapper, all toast auto-dismiss timers pause. When focus leaves, they resume. Same for hover (\`pointermove\` pauses, \`pointerleave\` resumes), and the window blur/focus events. This prevents a toast from disappearing while the user is reading or interacting with it.

Toast itself uses \`aria-live="assertive"\` for foreground type and \`"polite"\` for background:

\`\`\`tsx
aria-live={type === 'foreground' ? 'assertive' : 'polite'}
\`\`\`

Non-obvious gotcha: Toasts are not in the React tree of the Viewport — they're portaled in. The provider has to programmatically manage tab order so Tab moves through toasts in display order (newest first by default). Two invisible \`FocusProxy\` elements (\`headFocusProxyRef\`, \`tailFocusProxyRef\`) sit at the boundaries of the wrapper to catch Tab events and rebound focus. Without these proxies, Tab would escape the toast region into wherever the portal landed in the DOM — usually the bottom of \`<body>\`, far from where the user expects.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['radix-ui', 'toast', 'aria-live', 'portal', 'region'],
    repository: repo,
    filePath: 'packages/react/toast/src/toast.tsx',
    url: `${baseUrl}/packages/react/toast/src/toast.tsx`,
  },
  {
    title: 'Select: composable parts via createContextScope so multiple Selects can nest',
    body: `\`Select\` exposes 12+ subcomponents (Trigger, Value, Icon, Portal, Content, Viewport, Item, ItemText, ItemIndicator, Group, Label, Separator, ScrollUpButton, ScrollDownButton, Arrow). They all share state via a scoped context — and the scoping is what makes nested selects (e.g. a Select inside a DropdownMenu) work.

\`\`\`ts
// select.tsx
const [createSelectContext, createSelectScope] = createContextScope(SELECT_NAME, [
  createCollectionScope,
  createPopperScope,
]);
const usePopperScope = createPopperScope();
\`\`\`

\`createContextScope\` returns a context-creation function that namespaces by an opaque \`__scopeSelect\` prop instead of relying on \`React.createContext\` directly. Every Select part receives \`__scopeSelect\` and uses it to look up its parent. The reason: if you wrote a custom abstraction \`MySelect = createSelectScope()\`, the inner Select wouldn't accidentally see the outer Select's context (they'd live on different scope branches).

The dependency list \`[createCollectionScope, createPopperScope]\` is also significant. Select internally uses Collection (to track items for typeahead) and Popper (for positioning). By declaring those as upstream scopes, when you build a derived component on top of Select, the same scope key threads through Collection and Popper too.

The Trigger sets \`role="combobox"\`:

\`\`\`tsx
<Primitive.button
  type="button"
  role="combobox"
  aria-controls={context.contentId}
  aria-expanded={context.open}
  aria-required={context.required}
  aria-autocomplete="none"
  data-placeholder={shouldShowPlaceholder(context.value) ? '' : undefined}
  ...
/>
\`\`\`

It's not a \`<select>\` because the design requires custom styled options that the browser's native control can't deliver. To preserve form submission behavior Radix renders a hidden native \`<select>\` (\`SelectBubbleInput\`) with the same value alongside the visible combobox — that's why \`name\`, \`required\`, and \`autoComplete\` work in form contexts even though the visible UI is divs and buttons.

Non-obvious gotcha: \`useTypeaheadSearch\` lets users jump to items by typing. It uses a \`searchRef\` to accumulate keystrokes within a 1-second window, then resets. The reset is triggered both on timeout and on Open, so closing+reopening the Select clears the buffer.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['radix-ui', 'select', 'composition', 'context-scope', 'combobox'],
    repository: repo,
    filePath: 'packages/react/select/src/select.tsx',
    url: `${baseUrl}/packages/react/select/src/select.tsx`,
  },
  {
    title: 'DropdownMenu trigger: Enter/Space/ArrowDown all open and prevent default scroll',
    body: `The DropdownMenu Trigger handles keyboard activation differently from a plain button. Three keys open the menu: Enter, Space, and ArrowDown. The first two are standard, the ArrowDown is the WAI-ARIA convention for menu buttons.

\`\`\`tsx
// dropdown-menu.tsx — DropdownMenuTrigger
onPointerDown={composeEventHandlers(props.onPointerDown, (event) => {
  // only call handler if it's the left button (mousedown gets triggered by all mouse buttons)
  // but not when the control key is pressed (avoiding MacOS right click)
  if (!disabled && event.button === 0 && event.ctrlKey === false) {
    context.onOpenToggle();
    // prevent trigger focusing when opening
    // this allows the content to be given focus without competition
    if (!context.open) event.preventDefault();
  }
})}
onKeyDown={composeEventHandlers(props.onKeyDown, (event) => {
  if (disabled) return;
  if (['Enter', ' '].includes(event.key)) context.onOpenToggle();
  if (event.key === 'ArrowDown') context.onOpenChange(true);
  // prevent keydown from scrolling window / first focused item to execute
  // that keydown (inadvertently closing the menu)
  if (['Enter', ' ', 'ArrowDown'].includes(event.key)) event.preventDefault();
})}
\`\`\`

The \`event.preventDefault()\` on ArrowDown is critical: without it the browser scrolls the page on ArrowDown press, which in a portaled menu could move the trigger out of view between the moment you pressed ArrowDown and the moment the menu's first item received focus. The Enter/Space prevents are there for a different reason — once the menu is open, the keydown event would still propagate to the focused first item, and if Enter was the trigger it would immediately fire that item's click handler, dismissing the menu. Preventing default kills both behaviors.

The \`onPointerDown\` opens on left-click only — \`event.button === 0\` excludes middle/right click, and \`event.ctrlKey === false\` excludes MacOS right-click (where Ctrl+click is the OS contextmenu shortcut). Without the second check, MacOS users would accidentally open the dropdown trying to context-click somewhere nearby.

Non-obvious gotcha: \`if (!context.open) event.preventDefault()\` — preventDefault is only called when *opening*. When closing (the trigger is clicked while menu is already open), we want the trigger to focus normally because the menu is going away. When opening, we want focus to land on the menu's first item, not on the trigger, so we suppress the trigger's own focus. The whole sequence is designed so keyboard users land in the right place after one key press.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['radix-ui', 'dropdown-menu', 'keyboard', 'aria', 'wai-aria'],
    repository: repo,
    filePath: 'packages/react/dropdown-menu/src/dropdown-menu.tsx',
    url: `${baseUrl}/packages/react/dropdown-menu/src/dropdown-menu.tsx`,
  },
  {
    title: 'Tabs: controlled vs uncontrolled via useControllableState + activationMode',
    body: `Tabs supports both controlled (you pass \`value\` + \`onValueChange\`) and uncontrolled (you pass \`defaultValue\`) modes through a single hook: \`useControllableState\`. The hook handles the switch internally — your component code looks the same either way.

\`\`\`tsx
// tabs.tsx — Tabs
const [value, setValue] = useControllableState({
  prop: valueProp,        // controlled value or undefined
  onChange: onValueChange,
  defaultProp: defaultValue ?? '',
  caller: TABS_NAME,      // dev warning attribution
});
\`\`\`

The orthogonal axis is \`activationMode: 'automatic' | 'manual'\`. Automatic (default) means tabs activate as soon as they receive focus — common in browser tabs. Manual means focus moves with arrows but you must press Enter/Space to actually switch panels — useful when each tab requires expensive work to mount.

\`\`\`tsx
// TabsTrigger
onFocus={composeEventHandlers(props.onFocus, () => {
  const isAutomaticActivation = context.activationMode !== 'manual';
  if (!isSelected && !disabled && isAutomaticActivation) {
    context.onValueChange(value);
  }
})}
onKeyDown={composeEventHandlers(props.onKeyDown, (event) => {
  if ([' ', 'Enter'].includes(event.key)) context.onValueChange(value);
})}
\`\`\`

Arrow-key navigation is provided by \`RovingFocusGroup\` (Tabs delegates to it via \`<TabsList>\` rendering \`<RovingFocusGroup.Root>\` and \`<TabsTrigger>\` rendering \`<RovingFocusGroup.Item>\`). Loop, orientation, and direction (LTR/RTL) all flow through that subsystem.

The TabsContent uses \`<Presence>\` so animated tabs don't unmount until their close animation finishes:

\`\`\`tsx
<Presence present={forceMount || isSelected}>
  {({ present }) => (
    <Primitive.div role="tabpanel" hidden={!present} tabIndex={0} ...>
      {present && children}
    </Primitive.div>
  )}
</Presence>
\`\`\`

Non-obvious gotcha: \`isMountAnimationPreventedRef\` — on the very first mount of TabsContent, animation duration is forced to \`0s\` for one rAF tick. This prevents the initially-selected tab from animating in on page load (which would look odd because nothing changed — the tab is already selected). After one frame the ref flips and subsequent transitions animate normally. The same trick appears in CollapsibleContent.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['radix-ui', 'tabs', 'controlled', 'uncontrolled', 'roving-focus'],
    repository: repo,
    filePath: 'packages/react/tabs/src/tabs.tsx',
    url: `${baseUrl}/packages/react/tabs/src/tabs.tsx`,
  },
  {
    title: 'Accordion: type="single" vs type="multiple" diverge into two implementations',
    body: `Accordion's public API has a single \`<Accordion type="single" | "multiple">\` prop, but internally that boolean flag picks between two completely different implementations.

\`\`\`tsx
// accordion.tsx
const Accordion = React.forwardRef<AccordionElement, AccordionSingleProps | AccordionMultipleProps>(
  (props, forwardedRef) => {
    const { type, ...accordionProps } = props;
    return (
      <Collection.Provider scope={props.__scopeAccordion}>
        {type === 'multiple' ? (
          <AccordionImplMultiple {...multipleProps} ref={forwardedRef} />
        ) : (
          <AccordionImplSingle {...singleProps} ref={forwardedRef} />
        )}
      </Collection.Provider>
    );
  },
);
\`\`\`

The reason for the split is type-safety: \`single\` mode's \`value\` is \`string | undefined\`, while \`multiple\`'s is \`string[]\`. A single union type would force every consumer to narrow on every read. Splitting at the impl boundary lets each variant own its own state shape.

\`\`\`tsx
// AccordionImplSingle — single string value
const [value, setValue] = useControllableState({
  prop: valueProp,
  defaultProp: defaultValue ?? '',
  onChange: onValueChange,
});
// AccordionValueProvider exposes value as an array of length 0 or 1:
value={React.useMemo(() => (value ? [value] : []), [value])}
onItemOpen={setValue}
onItemClose={React.useCallback(() => collapsible && setValue(''), [collapsible, setValue])}

// AccordionImplMultiple — string[] value
const handleItemOpen = (itemValue: string) =>
  setValue((prevValue = []) => [...prevValue, itemValue]);
const handleItemClose = (itemValue: string) =>
  setValue((prevValue = []) => prevValue.filter((value) => value !== itemValue));
\`\`\`

Both impls hand the same shape (\`{ value: string[], onItemOpen, onItemClose }\`) to the inner \`AccordionValueProvider\`, so downstream Items don't care which variant they're in. AccordionItem just calls \`onItemOpen(itemValue)\` and \`onItemClose(itemValue)\` — the parent decides whether that means "set" or "add to array".

Single mode also takes a \`collapsible\` prop. By default closing the only-open item is a no-op (so an accordion always has exactly one open item, like radio buttons). \`collapsible: true\` allows the user to close all items and end up with nothing expanded — this is what the AccordionCollapsibleProvider context flag controls. Multiple mode is hard-coded to \`collapsible: true\` because it'd be nonsensical otherwise.

Non-obvious gotcha: \`type\` is not in \`useControllableState\` — switching from "single" to "multiple" at runtime won't migrate state. Don't conditionally toggle the prop or you'll lose your value.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['radix-ui', 'accordion', 'controlled', 'collection', 'collapsible'],
    repository: repo,
    filePath: 'packages/react/accordion/src/accordion.tsx',
    url: `${baseUrl}/packages/react/accordion/src/accordion.tsx`,
  },
  {
    title: 'Slot: render-as-child via cloneElement + prop merging',
    body: `\`Slot\` is the secret sauce behind every \`asChild\` prop in Radix. Instead of rendering its own DOM element, it clones the single child and merges its props onto it. The merge logic is the interesting part because it has to handle event handlers, className, style, and refs sensibly.

\`\`\`tsx
// slot.tsx — mergeProps
function mergeProps(slotProps: AnyProps, childProps: AnyProps) {
  const overrideProps = { ...childProps };

  for (const propName in childProps) {
    const slotPropValue = slotProps[propName];
    const childPropValue = childProps[propName];

    const isHandler = /^on[A-Z]/.test(propName);
    if (isHandler) {
      // if the handler exists on both, we compose them
      if (slotPropValue && childPropValue) {
        overrideProps[propName] = (...args: unknown[]) => {
          const result = childPropValue(...args);
          slotPropValue(...args);
          return result;
        };
      } else if (slotPropValue) {
        overrideProps[propName] = slotPropValue;
      }
    }
    else if (propName === 'style') {
      overrideProps[propName] = { ...slotPropValue, ...childPropValue };
    } else if (propName === 'className') {
      overrideProps[propName] = [slotPropValue, childPropValue].filter(Boolean).join(' ');
    }
  }
  return { ...slotProps, ...overrideProps };
}
\`\`\`

Three rules: (1) **handlers** (\`onClick\`, etc.) are *composed* — child's handler runs first, then slot's, with child's return value preserved. (2) **style** merges, with child styles winning on conflicts. (3) **className** concatenates with a space.

Refs are also composed via \`composeRefs(forwardedRef, childrenRef)\` so both the slot owner and the child author get a ref to the same DOM node.

\`\`\`tsx
// SlotClone
if (children.type !== React.Fragment) {
  props.ref = forwardedRef ? composeRefs(forwardedRef, childrenRef) : childrenRef;
}
return React.cloneElement(children, props);
\`\`\`

The exclusion of \`React.Fragment\` is because React 19 throws if you try to attach a ref to a Fragment. The \`createSlot(ownerName)\` factory is used per-component so devtools display \`Dialog.Slot\` instead of just \`Slot\` — useful when debugging which Radix primitive is doing the cloning.

Non-obvious gotcha: handler composition runs the child's handler first, *then* the slot's. If the child calls \`event.preventDefault()\` or \`event.stopPropagation()\`, Radix's slot-side handler still runs unconditionally. Most Radix internals use \`composeEventHandlers\` from \`@radix-ui/primitive\` instead, which checks \`event.defaultPrevented\` before running the inner handler — so behavior depends on whether you're inside Slot or composing on a regular Primitive.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['radix-ui', 'slot', 'aschild', 'composition', 'cloneElement'],
    repository: repo,
    filePath: 'packages/react/slot/src/slot.tsx',
    url: `${baseUrl}/packages/react/slot/src/slot.tsx`,
  },
  {
    title: 'Form: native validity + custom async matchers, validating only on `change` events',
    body: `Radix \`Form\` is built on top of native HTML form validation (\`required\`, \`pattern\`, \`type="email"\`) and extends it with custom matchers that can be sync or async. The whole system reads validity off the DOM rather than tracking field state in React.

\`\`\`tsx
// form.tsx — FormControl
React.useEffect(() => {
  const control = ref.current;
  if (control) {
    // We only want to validate on \`change\` (native event, not React's \`onChange\`).
    // This is primarily a UX decision — we don't want to validate on every keystroke
    // and React's \`onChange\` is the \`input\` event.
    const handleChange = () => updateControlValidity(control);
    control.addEventListener('change', handleChange);
    return () => control.removeEventListener('change', handleChange);
  }
}, [updateControlValidity]);
\`\`\`

The native \`change\` event fires when the user *commits* a value (blur on text inputs, click on checkboxes/selects), not on every keystroke. React's \`onChange\` prop maps to the \`input\` event which fires per-keystroke. For form validation, the \`change\` model is much better UX: the user types freely, sees an error after they leave the field, and gets feedback when they fix it.

\`updateControlValidity\` runs a layered check: first native validity (\`hasBuiltInError(control.validity)\`) — if any of \`tooShort\`, \`patternMismatch\`, \`valueMissing\` etc. fires, custom matchers are skipped. Otherwise sync custom matchers run, and only if those pass do async ones run.

\`\`\`tsx
// 4. run sync custom matchers
const syncCustomErrors = syncCustomMatcherEntries.map(({ id, match }) => {
  return [id, match(...matcherArgs)] as const;
});
const syncCustomErrorsById = Object.fromEntries(syncCustomErrors);
const hasSyncCustomErrors = Object.values(syncCustomErrorsById).some(Boolean);
control.setCustomValidity(hasCustomError ? DEFAULT_INVALID_MESSAGE : '');

// 5. run async custom matchers (only if sync passed)
if (!hasSyncCustomErrors && ayncCustomMatcherEntries.length > 0) {
  const promisedCustomErrors = ayncCustomMatcherEntries.map(({ id, match }) =>
    match(...matcherArgs).then((matches) => [id, matches] as const),
  );
  const asyncCustomErrors = await Promise.all(promisedCustomErrors);
  ...
}
\`\`\`

\`control.setCustomValidity()\` is the native API for adding non-built-in errors. Setting any non-empty string flips the \`customError\` flag in \`validity\` and prevents form submission. Setting \`''\` clears it.

The \`formData\` is built from the form on every validate — \`new FormData(control.form)\` — so cross-field matchers (e.g. "passwordConfirm matches password") get the latest values without React re-render coordination.

Non-obvious gotcha: async matchers run *only* if all sync matchers pass. This is a cost optimization (don't hit the network for "is this email taken?" if the format is wrong locally) but it means a single field can have stale async errors after a sync error appears. The component handles this by clearing custom validity when sync fails, then re-running async on the next change cycle. If your async check is expensive, debounce it externally — Radix doesn't.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['radix-ui', 'form', 'validation', 'native-validity', 'async'],
    repository: repo,
    filePath: 'packages/react/form/src/form.tsx',
    url: `${baseUrl}/packages/react/form/src/form.tsx`,
  },
  {
    title: 'VisuallyHidden: the canonical "screen-reader only" CSS, frozen as an object',
    body: `The visually-hidden pattern is a 9-property CSS recipe that hides an element from sighted users while keeping it announceable. Radix exports both the styles (so you can use them inline anywhere) and a \`VisuallyHidden\` component that applies them.

\`\`\`tsx
// visually-hidden.tsx
const VISUALLY_HIDDEN_STYLES = Object.freeze({
  // See: https://github.com/twbs/bootstrap/blob/main/scss/mixins/_visually-hidden.scss
  position: 'absolute',
  border: 0,
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  wordWrap: 'normal',
}) satisfies React.CSSProperties;

const VisuallyHidden = React.forwardRef<VisuallyHiddenElement, VisuallyHiddenProps>(
  (props, forwardedRef) => {
    return (
      <Primitive.span
        {...props}
        ref={forwardedRef}
        style={{ ...VISUALLY_HIDDEN_STYLES, ...props.style }}
      />
    );
  },
);
\`\`\`

Each property has a purpose: \`position: absolute\` removes from layout flow. \`width/height: 1\` (px) keeps it focusable — \`width: 0\` would make some screen readers skip it. \`margin: -1\` keeps the 1px box from creating any visible artifact. \`overflow: hidden\` + \`clip: rect(0,0,0,0)\` clips the content. \`whiteSpace: nowrap\` prevents text from wrapping into a vertical column at 1px wide. \`wordWrap: normal\` resets a value some user-agents inherit oddly.

Note what's absent: no \`display: none\` and no \`visibility: hidden\` — both would remove the element from the accessibility tree. The whole point is to be invisible *but discoverable*.

The styles are \`Object.freeze\`'d so a downstream consumer can't accidentally mutate the shared object (which would affect every VisuallyHidden in the tree). Spreading \`...props.style\` *after* the defaults means consumers can override but rarely should.

Non-obvious gotcha: VisuallyHidden renders a \`<span>\` by default. If you put block-level content inside (a paragraph, a list), the \`whiteSpace: nowrap\` + \`<span>\` combination can produce odd layouts in fallback browsers that don't honor the clip. For long content you should pass \`asChild\` and render an appropriate block container, or accept that the content is single-line. Also: do not put interactive elements (buttons, links) inside — they'd be focusable but invisible, trapping keyboard users.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['radix-ui', 'visually-hidden', 'a11y', 'screen-reader', 'css'],
    repository: repo,
    filePath: 'packages/react/visually-hidden/src/visually-hidden.tsx',
    url: `${baseUrl}/packages/react/visually-hidden/src/visually-hidden.tsx`,
  },
  {
    title: 'useControllableState: the dual-mode state hook every Radix root uses',
    body: `Every Radix root primitive (Dialog, Popover, Tabs, Accordion, Toggle...) is built on \`useControllableState\` so it can be either controlled or uncontrolled. The hook is ~80 lines and handles four edge cases that custom impls usually miss.

\`\`\`tsx
// use-controllable-state.tsx
export function useControllableState<T>({
  prop, defaultProp, onChange = () => {}, caller,
}: UseControllableStateParams<T>): [T, SetStateFn<T>] {
  const [uncontrolledProp, setUncontrolledProp, onChangeRef] = useUncontrolledState({ defaultProp, onChange });
  const isControlled = prop !== undefined;
  const value = isControlled ? prop : uncontrolledProp;

  // dev warning if controlled-ness changes mid-lifecycle
  if (process.env.NODE_ENV !== 'production') {
    const isControlledRef = React.useRef(prop !== undefined);
    React.useEffect(() => {
      const wasControlled = isControlledRef.current;
      if (wasControlled !== isControlled) {
        console.warn(\`\${caller} is changing from \${wasControlled ? 'controlled' : 'uncontrolled'} to \${isControlled ? 'controlled' : 'uncontrolled'}.\`);
      }
      isControlledRef.current = isControlled;
    }, [isControlled, caller]);
  }

  const setValue = React.useCallback<SetStateFn<T>>((nextValue) => {
    if (isControlled) {
      const value = isFunction(nextValue) ? nextValue(prop) : nextValue;
      if (value !== prop) onChangeRef.current?.(value);
    } else {
      setUncontrolledProp(nextValue);
    }
  }, [isControlled, prop, setUncontrolledProp, onChangeRef]);

  return [value, setValue];
}
\`\`\`

The four subtleties: (1) when controlled, \`setValue\` doesn't call \`useState\`'s setter — it only calls \`onChange\`, leaving the parent to re-render with a new \`prop\`. (2) when controlled, the function form of \`setValue\` (\`setValue(prev => ...)\`) is resolved against \`prop\` (the controlled value), not against any stale internal state. (3) in dev, switching from controlled to uncontrolled (or vice versa) logs a warning naming the component (the \`caller\` arg). (4) \`onChange\` is wrapped in a ref so the latest closure is always called even if the consumer passes inline lambdas — preventing stale-closure bugs in async callbacks.

The internal \`useUncontrolledState\` also fires \`onChange\` when the uncontrolled value changes, so consumers reading state via \`onChange\` see updates in either mode.

Non-obvious gotcha: \`useInsertionEffect\` is used to update the onChange ref when the consumer passes a new function. This runs *before* layout effects and DOM mutations, so the ref always sees the current handler before any other effect that might trigger \`setValue\` synchronously. Without this, a Dialog's open handler could close immediately on a stale callback. The \`useInsertionEffect\` import uses string-trim hackery (\`(React as any)[' useInsertionEffect '.trim().toString()]\`) to prevent bundlers from tree-shaking it out for React 17 builds.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['radix-ui', 'use-controllable-state', 'hook', 'controlled', 'uncontrolled'],
    repository: repo,
    filePath: 'packages/react/use-controllable-state/src/use-controllable-state.tsx',
    url: `${baseUrl}/packages/react/use-controllable-state/src/use-controllable-state.tsx`,
  },
  {
    title: 'useId: SSR-safe stable ids that work pre-React-18',
    body: `React 18 added \`React.useId()\` for SSR-safe ids. Radix wraps it with a fallback for older React versions so primitives don't break in React 17 apps.

\`\`\`tsx
// id.tsx
// We spaces with \`.trim().toString()\` to prevent bundlers from trying to \`import { useId } from 'react';\`
const useReactId = (React as any)[' useId '.trim().toString()] || (() => undefined);
let count = 0;

function useId(deterministicId?: string): string {
  const [id, setId] = React.useState<string | undefined>(useReactId());
  // React versions older than 18 will have client-side ids only.
  useLayoutEffect(() => {
    if (!deterministicId) setId((reactId) => reactId ?? String(count++));
  }, [deterministicId]);
  return deterministicId || (id ? \`radix-\${id}\` : '');
}
\`\`\`

Three pieces: (1) On React 18+, \`useReactId()\` returns a server-stable id like \`:r0:\`. The hook prefixes it to \`radix-:r0:\` so multiple instances in the same DOM are visibly Radix-owned. (2) On React 17 (no useId), \`useReactId()\` returns undefined, and the layoutEffect fills in a client-only id from a module-level counter — these are NOT SSR-safe (server and client will mismatch), but that's the best React 17 can do. (3) \`deterministicId\` is the escape hatch — pass a stable string when you want full control of the id (e.g. for forms with manual labels).

The string-trim trick on \`' useId '.trim().toString()\` is there because some bundlers (Webpack, esbuild plugin chains) try to statically analyze \`React.useId\` references and either tree-shake or polyfill them. By constructing the property name at runtime the bundler can't see the access, so it leaves both code paths intact and the runtime fallback works on either React version.

Why \`useLayoutEffect\`? Because the id is consumed by other components in the same render commit (e.g. a label's \`htmlFor\` and an input's \`id\` both come from the same \`useId\`), so we need the id set before the browser paints. \`useEffect\` would fire later and cause a flash where the relationship isn't yet wired.

Non-obvious gotcha: if you render a Radix primitive that calls \`useId\` inside a React 17 SSR app, the server-rendered HTML will contain an empty string for the id (because the layoutEffect hasn't run server-side), and the client will fill it in on hydration. This causes a \`aria-labelledby\` mismatch warning during hydration. The fix is to either upgrade to React 18 or pass \`deterministicId\` from the server.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['radix-ui', 'use-id', 'ssr', 'hook', 'react-18'],
    repository: repo,
    filePath: 'packages/react/id/src/id.tsx',
    url: `${baseUrl}/packages/react/id/src/id.tsx`,
  },
  {
    title: 'usePrevious: useMemo + ref to capture last render\'s value (no extra render)',
    body: `\`usePrevious\` is the classic "what was this value last render?" hook. The naive implementation uses \`useEffect\` to write to a ref after render, but Radix's version does it inside \`useMemo\` so the previous value is available *during* the same render that triggers the change.

\`\`\`tsx
// use-previous.tsx — full file
function usePrevious<T>(value: T) {
  const ref = React.useRef({ value, previous: value });

  // We compare values before making an update to ensure that
  // a change has been made. This ensures the previous value is
  // persisted correctly between renders.
  return React.useMemo(() => {
    if (ref.current.value !== value) {
      ref.current.previous = ref.current.value;
      ref.current.value = value;
    }
    return ref.current.previous;
  }, [value]);
}
\`\`\`

The trick: \`useMemo\` runs synchronously during render. When \`value\` differs from \`ref.current.value\`, the memo body shifts \`previous = value\`, then writes the new value, then returns \`previous\`. The ref shape \`{ value, previous }\` ensures both fields update atomically.

Why not the textbook \`useEffect\` version?

\`\`\`tsx
// the textbook (lagging) version
function usePrevious(value) {
  const ref = useRef();
  useEffect(() => { ref.current = value; }, [value]);
  return ref.current; // returns OLD value during render, updated AFTER paint
}
\`\`\`

The textbook version is fine if you only consume \`previous\` in another effect. But Radix needs it during render — e.g. to animate a transition between current and previous prop values, or to detect direction of change for a slider. Updating in \`useMemo\` makes it available immediately.

The strict-equality check (\`ref.current.value !== value\`) is important because React 18 strict mode invokes hooks twice during development. Without the guard, the double-invocation would shift previous → previous (losing the original previous value) on the second pass. With the guard, the second pass is a no-op because \`ref.current.value === value\` after the first pass set it.

Non-obvious gotcha: this hook violates React's "memos are best-effort" contract. React reserves the right to drop memos and recompute under memory pressure. If that happened here, the \`useMemo\` body would re-run, see \`ref.current.value === value\`, and return the right answer — so the violation is benign in this specific case. But don't copy this pattern blindly into hooks where the side-effect can't be re-derived; you'd get bugs that only appear in production under load.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['radix-ui', 'use-previous', 'hook', 'usememo', 'ref'],
    repository: repo,
    filePath: 'packages/react/use-previous/src/use-previous.tsx',
    url: `${baseUrl}/packages/react/use-previous/src/use-previous.tsx`,
  },
  {
    title: 'useSize: ResizeObserver wrapper with borderBoxSize cross-browser handling',
    body: `\`useSize\` returns the live \`{ width, height }\` of an element, updated whenever the element resizes. It's used inside Popper to track the trigger's size for arrow alignment, in Slider for thumb position math, and in Toast for swipe-distance calculations.

\`\`\`tsx
// use-size.tsx — full file
function useSize(element: HTMLElement | null) {
  const [size, setSize] = React.useState<{ width: number; height: number } | undefined>(undefined);

  useLayoutEffect(() => {
    if (element) {
      // provide size as early as possible
      setSize({ width: element.offsetWidth, height: element.offsetHeight });

      const resizeObserver = new ResizeObserver((entries) => {
        if (!Array.isArray(entries) || !entries.length) return;
        const entry = entries[0]!;
        let width: number;
        let height: number;

        if ('borderBoxSize' in entry) {
          const borderSizeEntry = entry['borderBoxSize'];
          // iron out differences between browsers
          const borderSize = Array.isArray(borderSizeEntry) ? borderSizeEntry[0] : borderSizeEntry;
          width = borderSize['inlineSize'];
          height = borderSize['blockSize'];
        } else {
          // for browsers that don't support \`borderBoxSize\`
          width = element.offsetWidth;
          height = element.offsetHeight;
        }
        setSize({ width, height });
      });

      resizeObserver.observe(element, { box: 'border-box' });
      return () => resizeObserver.unobserve(element);
    } else {
      // We only want to reset to \`undefined\` when the element becomes \`null\`
      setSize(undefined);
    }
  }, [element]);

  return size;
}
\`\`\`

Three details worth calling out:

(1) **First-render size**: \`setSize({ width: element.offsetWidth, height: element.offsetHeight })\` runs synchronously inside the layoutEffect *before* the ResizeObserver fires. Without this, consumers see \`undefined\` for one render cycle while waiting for the observer's first callback.

(2) **borderBoxSize variability**: the spec says \`borderBoxSize\` may be either an array (Chrome, Firefox modern) or a single object (early Safari). Radix branches on \`Array.isArray\` to handle both. \`inlineSize\`/\`blockSize\` are the writing-mode-aware equivalents of width/height — important for vertical text (CJK) where inline = vertical.

(3) **null reset**: when \`element\` becomes null, \`setSize(undefined)\` clears the stale size. But when \`element\` changes from one HTMLElement to another, the \`else\` branch is skipped — so consumers don't briefly see undefined during a swap. The comment explicitly calls this out.

Non-obvious gotcha: the dependency is just \`[element]\` (the actual node), not a ref. So consumers must pass a *stable* element reference. The standard pattern is \`const [node, setNode] = useState<HTMLElement | null>(null); ... ref={setNode}\` — using a callback ref to capture the node into state. Passing \`ref.current\` directly (a ref object's \`.current\`) won't work because changing \`.current\` doesn't trigger re-render and the effect never re-subscribes.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['radix-ui', 'use-size', 'resize-observer', 'hook', 'layout'],
    repository: repo,
    filePath: 'packages/react/use-size/src/use-size.tsx',
    url: `${baseUrl}/packages/react/use-size/src/use-size.tsx`,
  },
  {
    title: 'useEscapeKeydown: capture-phase listener with auto-cleanup',
    body: `Closing things on Escape sounds trivial but the default \`addEventListener('keydown', ...)\` on the bubble phase loses to capturing libraries (modal libs, code-editor capturing keystrokes). Radix uses the capture phase so its handler always sees the event first.

\`\`\`tsx
// use-escape-keydown.tsx — full file
function useEscapeKeydown(
  onEscapeKeyDownProp?: (event: KeyboardEvent) => void,
  ownerDocument: Document = globalThis?.document,
) {
  const onEscapeKeyDown = useCallbackRef(onEscapeKeyDownProp);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onEscapeKeyDown(event);
      }
    };
    ownerDocument.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => ownerDocument.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [onEscapeKeyDown, ownerDocument]);
}
\`\`\`

Four design choices in 25 lines:

(1) **\`useCallbackRef\`** wraps the handler in a stable ref so the effect's dependency array doesn't churn. Consumers can pass inline arrow functions without re-attaching the listener every render.

(2) **\`{ capture: true }\`** on both add and remove. Capture means the listener fires *during* the capturing phase (top-down from window to target), before the bubbling phase (target up to window) where most app handlers live. So a Dialog using \`useEscapeKeydown\` will close on Escape even if some inner element calls \`event.stopPropagation()\` in its bubble-phase handler. Critically, the third arg must match between add and remove or the listener leaks.

(3) **\`ownerDocument\` parameter** lets a Dialog rendered into an iframe use that iframe's document instead of \`globalThis.document\`. Without it, Escape inside a sandboxed editor (e.g. CodeMirror in an iframe) wouldn't close the parent's modal. Default is the host page's document.

(4) **\`globalThis?.document\`** with optional chaining means the hook can be imported at module-evaluation time during SSR (where \`document\` is undefined) without throwing. The actual subscription happens in \`useEffect\`, which only runs client-side, so the optional chaining only protects the default-arg evaluation.

Non-obvious gotcha: capture-phase listeners interact awkwardly with \`event.preventDefault()\` in the handler. If your handler prevents default to stop browser-native Escape behavior (like exiting fullscreen), you'll also stop other Radix Dialogs higher up in a nested-modal scenario from receiving Escape. DismissableLayer (which uses this hook) deliberately checks \`isHighestLayer\` first and only calls \`event.preventDefault()\` when this layer is the top — so Escape only closes the topmost dismissable thing.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['radix-ui', 'use-escape-keydown', 'hook', 'capture-phase', 'keyboard'],
    repository: repo,
    filePath: 'packages/react/use-escape-keydown/src/use-escape-keydown.tsx',
    url: `${baseUrl}/packages/react/use-escape-keydown/src/use-escape-keydown.tsx`,
  },
  {
    title: 'useFocusGuards: invisible Tab traps at <body> edges (refcounted)',
    body: `Focus trap libraries struggle with portaled content because the portal lives at the end of \`<body>\`, which means \`Tab\` from the last focusable element inside the trap moves focus to the browser's chrome (URL bar) instead of cycling. \`useFocusGuards\` solves this by inserting a pair of invisible spans at the very start and end of \`<body>\`.

\`\`\`tsx
// focus-guards.tsx — full file
let count = 0;

function useFocusGuards() {
  React.useEffect(() => {
    const edgeGuards = document.querySelectorAll('[data-radix-focus-guard]');
    document.body.insertAdjacentElement('afterbegin', edgeGuards[0] ?? createFocusGuard());
    document.body.insertAdjacentElement('beforeend', edgeGuards[1] ?? createFocusGuard());
    count++;

    return () => {
      if (count === 1) {
        document.querySelectorAll('[data-radix-focus-guard]').forEach((node) => node.remove());
      }
      count--;
    };
  }, []);
}

function createFocusGuard() {
  const element = document.createElement('span');
  element.setAttribute('data-radix-focus-guard', '');
  element.tabIndex = 0;
  element.style.outline = 'none';
  element.style.opacity = '0';
  element.style.position = 'fixed';
  element.style.pointerEvents = 'none';
  return element;
}
\`\`\`

Each guard is a \`<span tabIndex={0}>\` with \`opacity: 0\`, \`pointer-events: none\`, \`position: fixed\` — invisible but tabbable. When the user Tabs from the last item in a Dialog, focus lands on the trailing guard. \`FocusScope\` watches for focus on guards and forces it back inside the trap.

The interesting bit is the **module-level refcount**. Multiple components can call \`useFocusGuards\` simultaneously (a Dialog containing a Popover containing a Tooltip). The first one inserts the guards; subsequent ones reuse the existing guards (the \`?? createFocusGuard()\` only fires when no guard exists). The cleanup only removes the guards when the *last* user (\`count === 1\` before decrement) unmounts. This way the DOM stays clean — there's never more than one pair of guards regardless of how many trapped layers are mounted.

The order \`if (count === 1) { remove } count--\` matters. \`count\` is checked *before* the decrement, so when the last user unmounts, count is 1, the guards get removed, and then count goes to 0. Reversing the order would either remove guards while another user still needs them (\`count === 0 → remove → count--\` underflows) or leak guards forever.

Non-obvious gotcha: the guards get inserted via \`insertAdjacentElement\`, which moves an existing node rather than cloning. So if you have Strict Mode double-invoking effects, the second invocation sees the existing guards from the first invocation, reuses them, and the \`count\` increments correctly to 2 — the cleanup will fire twice (once for each strict-mode pass) and decrement back to 0. The whole dance happens to be strict-mode-safe, but only because of the early \`querySelectorAll\` check.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['radix-ui', 'focus-guards', 'focus-trap', 'a11y', 'portal'],
    repository: repo,
    filePath: 'packages/react/focus-guards/src/focus-guards.tsx',
    url: `${baseUrl}/packages/react/focus-guards/src/focus-guards.tsx`,
  },
  {
    title: 'composeRefs: merge forwarded ref + internal ref, with React 19 cleanup support',
    body: `When you forwardRef but also need an internal ref to the same DOM node, you have to merge them. Radix's \`composeRefs\` handles callback refs, ref objects, and React 19's new ref-cleanup return values.

\`\`\`tsx
// compose-refs.tsx
function setRef<T>(ref: PossibleRef<T>, value: T) {
  if (typeof ref === 'function') {
    return ref(value);
  } else if (ref !== null && ref !== undefined) {
    ref.current = value;
  }
}

function composeRefs<T>(...refs: PossibleRef<T>[]): React.RefCallback<T> {
  return (node) => {
    let hasCleanup = false;
    const cleanups = refs.map((ref) => {
      const cleanup = setRef(ref, node);
      if (!hasCleanup && typeof cleanup == 'function') {
        hasCleanup = true;
      }
      return cleanup;
    });

    if (hasCleanup) {
      return () => {
        for (let i = 0; i < cleanups.length; i++) {
          const cleanup = cleanups[i];
          if (typeof cleanup == 'function') {
            cleanup();
          } else {
            setRef(refs[i], null);
          }
        }
      };
    }
  };
}

function useComposedRefs<T>(...refs: PossibleRef<T>[]): React.RefCallback<T> {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return React.useCallback(composeRefs(...refs), refs);
}
\`\`\`

The function returns a single callback ref that, when invoked with a DOM node, calls each input ref appropriately:
- Function refs → called with the node, return value captured.
- Ref objects → \`.current\` assigned.
- null/undefined → ignored.

The React 19 wrinkle: a callback ref can now return a cleanup function. If *any* of the input refs returned a cleanup, \`composeRefs\` returns a master cleanup that calls each individual cleanup (or sets the ref to null if it was an object ref). React calls this on unmount or when the ref node changes.

If *no* refs returned a cleanup, the function returns nothing, which keeps backward compat with React 18 (which warns when callback refs return values it doesn't expect).

\`useComposedRefs\` wraps with \`useCallback\` so the returned ref function is stable across renders unless the input refs change. The eslint-disable is because passing \`...refs\` as the dep array isn't statically analyzable, but the spread does the right thing (it's a fresh array each render, so React detects changes correctly).

Non-obvious gotcha: composing more than 3-4 refs is usually a code smell — it means a component has too many concerns. Radix uses \`useComposedRefs(forwardedRef, contentRef, context.contentRef)\` (three refs) in DialogContentModal because content needs to be exposed externally, used internally for \`hideOthers\`, and also stored in context for the overlay's RemoveScroll shards. Each ref has a clear purpose, and composing them lets a single \`ref={composedRefs}\` attach all three at once.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['radix-ui', 'compose-refs', 'forwardref', 'hook', 'react-19'],
    repository: repo,
    filePath: 'packages/react/compose-refs/src/compose-refs.tsx',
    url: `${baseUrl}/packages/react/compose-refs/src/compose-refs.tsx`,
  },
  {
    title: 'DismissableLayer: layered outside-click + escape with topmost-wins semantics',
    body: `\`DismissableLayer\` is the abstraction behind every "click outside to close" behavior in Radix (Dialog, Popover, Menu, Tooltip, Select). It maintains a global stack of layers and only the topmost one responds to Escape — so closing nested popovers happens one at a time.

\`\`\`tsx
// dismissable-layer.tsx
const DismissableLayerContext = React.createContext({
  layers: new Set<DismissableLayerElement>(),
  layersWithOutsidePointerEventsDisabled: new Set<DismissableLayerElement>(),
  branches: new Set<DismissableLayerBranchElement>(),
});

const pointerDownOutside = usePointerDownOutside((event) => {
  const target = event.target as HTMLElement;
  const isPointerDownOnBranch = [...context.branches].some((branch) => branch.contains(target));
  if (!isPointerEventsEnabled || isPointerDownOnBranch) return;
  onPointerDownOutside?.(event);
  onInteractOutside?.(event);
  if (!event.defaultPrevented) onDismiss?.();
}, ownerDocument);

useEscapeKeydown((event) => {
  const isHighestLayer = index === context.layers.size - 1;
  if (!isHighestLayer) return;
  onEscapeKeyDown?.(event);
  if (!event.defaultPrevented && onDismiss) {
    event.preventDefault();
    onDismiss();
  }
}, ownerDocument);
\`\`\`

Three sets in context: **layers** (every active dismissable), **layersWithOutsidePointerEventsDisabled** (modals that block clicks on the rest of the page), and **branches** (sub-trees that should be treated as "inside" even though they're DOM-detached, e.g. a Tooltip portaled out of a Dialog should not close the Dialog when clicked).

The Escape handler shows the stacking discipline: only the highest layer fires. Press Escape with a Dialog open and a Popover inside it open — the Popover closes, the Dialog stays. Press again, the Dialog closes. \`event.preventDefault()\` is called *only when* this layer dismisses, which has the side effect of stopping Escape from also exiting browser fullscreen mode.

\`\`\`tsx
// modal-style layer (Dialog modal mode)
React.useEffect(() => {
  if (!node) return;
  if (disableOutsidePointerEvents) {
    if (context.layersWithOutsidePointerEventsDisabled.size === 0) {
      originalBodyPointerEvents = ownerDocument.body.style.pointerEvents;
      ownerDocument.body.style.pointerEvents = 'none';
    }
    context.layersWithOutsidePointerEventsDisabled.add(node);
  }
  context.layers.add(node);
  ...
}, [node, ...]);
\`\`\`

Modal Dialogs set \`pointer-events: none\` on \`<body>\` to physically block clicks underneath. Non-modal Popovers don't — they let outside interactions through but still close on click.

Non-obvious gotcha: \`branches\` exists because of nested Portal-rendered children. A Dialog's Tooltip portals to body, so a click on the Tooltip is technically "outside" the Dialog's content DOM subtree. Without branches, clicking the Tooltip would close the Dialog. By registering the Tooltip's root as a branch of the Dialog, the Dialog's pointerDownOutside handler ignores clicks within it. Each Radix component that wraps DismissableLayer has the option to register itself as a branch of its ancestors.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['radix-ui', 'dismissable-layer', 'outside-click', 'escape', 'modal'],
    repository: repo,
    filePath: 'packages/react/dismissable-layer/src/dismissable-layer.tsx',
    url: `${baseUrl}/packages/react/dismissable-layer/src/dismissable-layer.tsx`,
  },
  {
    title: 'Portal: createPortal to document.body, mount-flag to dodge SSR',
    body: `The Portal primitive is 30 lines. Its job is to render children into a different part of the DOM tree (default: \`document.body\`) without breaking React's normal child-render flow.

\`\`\`tsx
// portal.tsx — full file
const Portal = React.forwardRef<PortalElement, PortalProps>((props, forwardedRef) => {
  const { container: containerProp, ...portalProps } = props;
  const [mounted, setMounted] = React.useState(false);
  useLayoutEffect(() => setMounted(true), []);
  const container = containerProp || (mounted && globalThis?.document?.body);
  return container
    ? ReactDOM.createPortal(<Primitive.div {...portalProps} ref={forwardedRef} />, container)
    : null;
});
\`\`\`

The \`mounted\` flag is a deliberate SSR-safety dance. On the server, \`useLayoutEffect\` does nothing, so \`mounted\` stays false, and the portal returns \`null\` — meaning portaled content does NOT appear in the SSR HTML. On the client's first render (hydration), \`mounted\` is also false, so the hydrated DOM matches the server (still null). Then the layoutEffect fires, \`setMounted(true)\` triggers a re-render, and the portal contents appear in \`document.body\`.

Why not render server-side? Because \`document.body\` doesn't exist on the server. \`createPortal\` would throw. Workarounds (renderToString a separate tree) don't reliably integrate with hydration. The pragmatic answer: portaled content is almost always interactive UI (modals, tooltips, dropdowns) that's closed by default — not visible until a user action. Skipping SSR for it is fine.

The \`globalThis?.document?.body\` chain is double-protection: \`globalThis\` exists in Node, but \`document\` doesn't (unless via jsdom), so optional chaining short-circuits cleanly. The \`mounted\` check is redundant in practice but keeps the type narrowed (\`document.body\` is HTMLElement, but \`globalThis?.document?.body\` is HTMLElement | undefined, and the \`mounted &&\` narrows to truthy).

\`container\` can be overridden — useful for portaling into a custom container (a \`<dialog>\` element, an \`<iframe>\` body, or a specific div inside a layout). The check accepts any \`Element | DocumentFragment | null\`.

Non-obvious gotcha: events bubble from portaled DOM through the *React tree*, not the DOM tree. So a click inside a Portal-rendered Tooltip will bubble to the React parent (a Dialog), even though the DOM is at \`<body>\`. This is React's "synthetic event" feature and it's why DismissableLayer's branches mechanism is needed — the Tooltip click bubbles up via React, but DismissableLayer uses native \`document.addEventListener('pointerdown', ...)\` which sees the DOM-tree event and considers it "outside." Branches reconcile the two views.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['radix-ui', 'portal', 'react-dom', 'ssr', 'hydration'],
    repository: repo,
    filePath: 'packages/react/portal/src/portal.tsx',
    url: `${baseUrl}/packages/react/portal/src/portal.tsx`,
  },
  {
    title: 'RovingFocusGroup: tabIndex juggling so only one item per group is in tab order',
    body: `Composite widgets (Tabs, Toolbar, Menu, RadioGroup, ToggleGroup) share a keyboard convention: Tab enters the group landing on the active item, then arrow keys move within the group, Tab again exits. \`RovingFocusGroup\` provides this by manipulating \`tabIndex\` so only one item has \`tabIndex={0}\` at a time.

\`\`\`tsx
// roving-focus-group.tsx — RovingFocusGroupItem
const isCurrentTabStop = context.currentTabStopId === id;

return (
  <Collection.ItemSlot scope={...} id={id} focusable={focusable} active={active}>
    <Primitive.span
      tabIndex={isCurrentTabStop ? 0 : -1}
      data-orientation={context.orientation}
      ref={forwardedRef}
      onMouseDown={composeEventHandlers(props.onMouseDown, (event) => {
        if (!focusable) event.preventDefault();
        else context.onItemFocus(id);
      })}
      onFocus={composeEventHandlers(props.onFocus, () => context.onItemFocus(id))}
      onKeyDown={composeEventHandlers(props.onKeyDown, (event) => {
        if (event.key === 'Tab' && event.shiftKey) {
          context.onItemShiftTab();
          return;
        }
        if (event.target !== event.currentTarget) return;
        const focusIntent = getFocusIntent(event, context.orientation, context.dir);
        if (focusIntent !== undefined) {
          event.preventDefault();
          const items = getItems().filter((item) => item.focusable);
          let candidateNodes = items.map((item) => item.ref.current!);
          if (focusIntent === 'last') candidateNodes.reverse();
          else if (focusIntent === 'prev' || focusIntent === 'next') {
            if (focusIntent === 'prev') candidateNodes.reverse();
            const currentIndex = candidateNodes.indexOf(event.currentTarget);
            candidateNodes = context.loop
              ? wrapArray(candidateNodes, currentIndex + 1)
              : candidateNodes.slice(currentIndex + 1);
          }
          // Imperative focus during keydown is risky so we prevent React's batching updates
          // to avoid potential bugs. See: https://github.com/facebook/react/issues/20332
          setTimeout(() => focusFirst(candidateNodes));
        }
      })}
    />
  </Collection.ItemSlot>
);
\`\`\`

Three sub-systems work together:

(1) **\`Collection\`** is a separate Radix primitive that gives ordered access to all items in DOM order. It uses a hidden Slot wrapper so DOM mutations (sort, filter, conditional rendering) automatically reorder the collection.

(2) **\`getFocusIntent\`** maps key + orientation + dir to one of \`first|last|prev|next\`. ArrowRight in horizontal LTR = next; ArrowRight in horizontal RTL = prev. ArrowDown only navigates in vertical orientation; in horizontal, it does nothing (lets the page scroll).

(3) The **\`setTimeout(() => focusFirst(...))\`** is the linked React issue (#20332). Calling \`.focus()\` synchronously inside a keydown handler can cause React to lose track of which element should be re-rendered, leading to inconsistent state. Deferring with \`setTimeout(0)\` lets React's batched update settle first, then the focus moves cleanly.

Non-obvious gotcha: \`if (event.target !== event.currentTarget) return\` skips arrow handling when the event originated inside the item (e.g. an input within a Toolbar item). Without this, typing arrow keys in an input would jump to the next Toolbar item instead of moving the cursor.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['radix-ui', 'roving-focus', 'tabindex', 'keyboard', 'composite-widget'],
    repository: repo,
    filePath: 'packages/react/roving-focus/src/roving-focus-group.tsx',
    url: `${baseUrl}/packages/react/roving-focus/src/roving-focus-group.tsx`,
  },
  {
    title: 'AlertDialog: the no-easy-dismiss dialog (no outside-click, focus on Cancel)',
    body: `\`AlertDialog\` is a thin wrapper over \`Dialog\` with three differences that make it suitable for irreversible-action confirmations: it forces \`modal: true\`, blocks the outside-click escape hatch, and focuses the Cancel button instead of the first focusable.

\`\`\`tsx
// alert-dialog.tsx
const AlertDialog: React.FC<AlertDialogProps> = (props) => {
  const dialogScope = useDialogScope(__scopeAlertDialog);
  return <DialogPrimitive.Root {...dialogScope} {...alertDialogProps} modal={true} />;
};

// AlertDialogContent
return (
  <DialogPrimitive.WarningProvider
    contentName={CONTENT_NAME}
    titleName={TITLE_NAME}
    docsSlug="alert-dialog">
    <AlertDialogContentProvider scope={__scopeAlertDialog} cancelRef={cancelRef}>
      <DialogPrimitive.Content
        role="alertdialog"
        {...dialogScope}
        {...contentProps}
        ref={composedRefs}
        onOpenAutoFocus={composeEventHandlers(contentProps.onOpenAutoFocus, (event) => {
          event.preventDefault();
          cancelRef.current?.focus({ preventScroll: true });
        })}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}>
        <Slottable>{children}</Slottable>
      </DialogPrimitive.Content>
    </AlertDialogContentProvider>
  </DialogPrimitive.WarningProvider>
);
\`\`\`

The three changes:

(1) **\`role="alertdialog"\`** instead of \`"dialog"\` — screen readers announce it more urgently and follow different focus rules (focus on the dialog body itself rather than just its title).

(2) **\`onPointerDownOutside\` and \`onInteractOutside\` always preventDefault** — clicking the overlay does nothing. The only ways to dismiss are pressing Escape (still works because that's a separate handler in DismissableLayer) or pressing one of the explicit Cancel/Action buttons.

(3) **\`onOpenAutoFocus\` redirects to \`cancelRef\`** — instead of focusing the first focusable element (which would be the Action button, the destructive one), AlertDialog focuses the Cancel button. This is the WAI-ARIA pattern: the safer option should be the default. The \`cancelRef\` is collected via \`AlertDialogCancel\`'s context registration:

\`\`\`tsx
// AlertDialogCancel
return <DialogPrimitive.Close {...dialogScope} {...cancelProps} ref={composedRefs} />;
// where composedRefs = useComposedRefs(forwardedRef, context.cancelRef)
\`\`\`

\`AlertDialogAction\` and \`AlertDialogCancel\` are both renamed \`DialogClose\` — they auto-close the dialog when clicked. The only structural difference is that Cancel registers its ref into context for autofocus.

Non-obvious gotcha: if you forget \`<AlertDialog.Cancel>\` entirely (only render \`<AlertDialog.Action>\`), \`cancelRef.current\` is null and \`focus({ preventScroll: true })\` is a no-op, so focus falls through to the dialog content itself. The user can still Tab to the Action button — but the autofocus discipline of "focus the safe option" is silently broken. Lint rules can't catch this, so reviewers should look for the Cancel pair on every AlertDialog.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['radix-ui', 'alert-dialog', 'accessibility', 'modal', 'focus'],
    repository: repo,
    filePath: 'packages/react/alert-dialog/src/alert-dialog.tsx',
    url: `${baseUrl}/packages/react/alert-dialog/src/alert-dialog.tsx`,
  },
  {
    title: 'Tooltip: TooltipProvider sets shared open delay + skipDelay window',
    body: `\`Tooltip\` requires a \`<TooltipProvider>\` ancestor. The provider tracks a single piece of state shared across all Tooltips: whether the user is currently in a "skip delay" window where opening the next tooltip should be instant.

\`\`\`tsx
// tooltip.tsx — TooltipProvider
const DEFAULT_DELAY_DURATION = 700;

const TooltipProvider: React.FC<TooltipProviderProps> = (props) => {
  const {
    delayDuration = DEFAULT_DELAY_DURATION,
    skipDelayDuration = 300,
    disableHoverableContent = false,
    children,
  } = props;
  const isOpenDelayedRef = React.useRef(true);
  const isPointerInTransitRef = React.useRef(false);
  const skipDelayTimerRef = React.useRef(0);

  return (
    <TooltipProviderContextProvider
      isOpenDelayedRef={isOpenDelayedRef}
      delayDuration={delayDuration}
      onOpen={React.useCallback(() => {
        window.clearTimeout(skipDelayTimerRef.current);
        isOpenDelayedRef.current = false;
      }, [])}
      onClose={React.useCallback(() => {
        window.clearTimeout(skipDelayTimerRef.current);
        skipDelayTimerRef.current = window.setTimeout(
          () => (isOpenDelayedRef.current = true),
          skipDelayDuration,
        );
      }, [skipDelayDuration])}
      ...
    >
      {children}
    </TooltipProviderContextProvider>
  );
};
\`\`\`

The "skip delay" mechanic: when a tooltip opens, \`isOpenDelayedRef.current = false\`. When it closes, a timer (\`skipDelayDuration\`, default 300ms) starts. If the user hovers a *different* tooltip's trigger within that 300ms window, the new tooltip opens instantly (because \`isOpenDelayedRef.current\` is still false). If they wait longer than 300ms, the flag flips back to true and the new tooltip uses the full \`delayDuration\` (default 700ms).

This matches Mac OS / Material Design tooltip behavior: hovering once is "exploratory" (slow open), but once you've seen one, scanning a row of icons feels instant.

\`isPointerInTransitRef\` is checked when the cursor moves between trigger and content. If the user is hover-traveling from Trigger to Content along a small "safe path," the tooltip stays open even though the cursor briefly crosses outside both elements — \`disableHoverableContent: false\` (the default) requires this transit detection.

Each individual \`Tooltip\` can override the delay via its own \`delayDuration\` prop, falling back to the provider's value:

\`\`\`tsx
const delayDuration = delayDurationProp ?? providerContext.delayDuration;
\`\`\`

Non-obvious gotcha: TooltipProvider is required — without it, calling \`useTooltipProviderContext\` throws "Tooltip must be used within TooltipProvider". This is intentional; the shared timing state has no sensible default for an isolated tooltip. The common mistake is rendering \`<TooltipProvider>\` per page section, which gives each section its own skip-delay window. For most apps you want one provider near the root so the skip-delay carries across the entire UI.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['radix-ui', 'tooltip', 'provider', 'delay', 'group'],
    repository: repo,
    filePath: 'packages/react/tooltip/src/tooltip.tsx',
    url: `${baseUrl}/packages/react/tooltip/src/tooltip.tsx`,
  },
  {
    title: 'Toggle vs ToggleGroup: aria-pressed on the loner, single/multiple value modes on the set',
    body: `\`Toggle\` is a one-button on/off control with \`aria-pressed\`. \`ToggleGroup\` is a coordinated set of toggles (formatting toolbar style) that can be either single-select (radio-like) or multi-select (checkbox-like).

\`\`\`tsx
// toggle.tsx — full file (pressed-state toggling)
const Toggle = React.forwardRef<ToggleElement, ToggleProps>((props, forwardedRef) => {
  const { pressed: pressedProp, defaultPressed, onPressedChange, ...buttonProps } = props;
  const [pressed, setPressed] = useControllableState({
    prop: pressedProp,
    onChange: onPressedChange,
    defaultProp: defaultPressed ?? false,
    caller: NAME,
  });

  return (
    <Primitive.button
      type="button"
      aria-pressed={pressed}
      data-state={pressed ? 'on' : 'off'}
      data-disabled={props.disabled ? '' : undefined}
      {...buttonProps}
      ref={forwardedRef}
      onClick={composeEventHandlers(props.onClick, () => {
        if (!props.disabled) {
          setPressed(!pressed);
        }
      })}
    />
  );
});
\`\`\`

\`aria-pressed\` (true/false) is what makes this a toggle button vs a regular button — screen readers announce "pressed" or "not pressed" status. \`data-state="on"|"off"\` is the styling hook (\`[data-state="on"]\` selector).

ToggleGroup wraps multiple toggles in a RovingFocusGroup so arrow keys navigate within the group, and replaces each \`Toggle\`'s individual pressed state with a coordinated value:

\`\`\`tsx
// toggle-group.tsx — single mode
const ToggleGroupImplSingle = React.forwardRef<...>((props, forwardedRef) => {
  const [value, setValue] = useControllableState({ prop, defaultProp: '', onChange, caller });
  return (
    <ToggleGroupValueProvider
      type="single"
      value={React.useMemo(() => (value ? [value] : []), [value])}
      onItemActivate={setValue}
      onItemDeactivate={React.useCallback(() => setValue(''), [setValue])}>
      <ToggleGroupImpl {...toggleGroupSingleProps} ref={forwardedRef} />
    </ToggleGroupValueProvider>
  );
});

// multiple mode
const handleButtonActivate = (itemValue: string) =>
  setValue((prevValue = []) => [...prevValue, itemValue]);
\`\`\`

The single-vs-multiple split mirrors Accordion exactly — same useControllableState pattern, same array-or-string disambiguation, same Provider exposing a uniform array interface to inner items. Single mode treats deactivate as setting empty string; multiple mode appends/removes.

A ToggleGroupItem looks at \`context.value.includes(itemValue)\` to determine its pressed state and calls \`onItemActivate(itemValue)\` or \`onItemDeactivate(itemValue)\` on click — never managing its own \`useState\` because the group is the source of truth.

Non-obvious gotcha: in single mode, clicking the currently-active toggle deactivates it (setting value to ''). If you want true radio-like behavior where one option must always be selected, you have to handle this in onValueChange: \`onValueChange={(v) => v && setValue(v)}\` (ignore empty-string events). The component itself doesn't enforce a "must have at least one selected" invariant — that's left to the consumer.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['radix-ui', 'toggle', 'toggle-group', 'aria-pressed', 'single-multiple'],
    repository: repo,
    filePath: 'packages/react/toggle-group/src/toggle-group.tsx',
    url: `${baseUrl}/packages/react/toggle-group/src/toggle-group.tsx`,
  },
  {
    title: 'ScrollArea: hide native scrollbars via injected style, render custom on top',
    body: `\`ScrollArea\` keeps native scroll behavior (momentum, accessibility, mouse wheel) but replaces the visible scrollbars with custom-styled ones. The trick is injecting a style block that hides native scrollbars cross-browser.

\`\`\`tsx
// scroll-area.tsx — ScrollAreaViewport
return (
  <>
    {/* Hide scrollbars cross-browser and enable momentum scroll for touch devices */}
    <style
      dangerouslySetInnerHTML={{
        __html: \`[data-radix-scroll-area-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-scroll-area-viewport]::-webkit-scrollbar{display:none}\`,
      }}
      nonce={nonce}
    />
    <Primitive.div
      data-radix-scroll-area-viewport=""
      {...viewportProps}
      ref={composedRefs}
      style={{
        overflowX: context.scrollbarXEnabled ? 'scroll' : 'hidden',
        overflowY: context.scrollbarYEnabled ? 'scroll' : 'hidden',
        ...props.style,
      }}>
      <div ref={context.onContentChange} style={{ minWidth: '100%', display: 'table' }}>
        {children}
      </div>
    </Primitive.div>
  </>
);
\`\`\`

The CSS recipe handles three browser families:
- \`scrollbar-width: none\` — Firefox
- \`-ms-overflow-style: none\` — old Edge / IE
- \`::-webkit-scrollbar { display: none }\` — Chrome / Safari / new Edge

\`-webkit-overflow-scrolling: touch\` is iOS Safari's "momentum scroll" enabler — without it, swiping inside the scroll area feels stiff compared to native scrolling.

\`overflowX/Y\` is set to \`scroll\` (not \`auto\`) when a scrollbar is enabled. \`scroll\` always reserves scroll space — the comment says: "we tell it to with the intention of hiding them in CSS." If \`auto\` were used, the browser would still need to decide whether to render scrollbars and might briefly show them before the inline style takes effect.

The inner \`display: table\` div is a layout hack. Tables size themselves to their content's intrinsic width, so the inner div grows past its parent's clip-width when content overflows horizontally. \`minWidth: 100%\` ensures it fills the viewport when content doesn't overflow. Without this, horizontal scrolling wouldn't work for content with width based on percentages.

The \`type\` prop (\`'auto' | 'always' | 'scroll' | 'hover'\`) picks which scrollbar visibility component is rendered:

\`\`\`tsx
return context.type === 'hover' ? <ScrollAreaScrollbarHover ... />
  : context.type === 'scroll' ? <ScrollAreaScrollbarScroll ... />
  : context.type === 'auto' ? <ScrollAreaScrollbarAuto ... />
  : context.type === 'always' ? <ScrollAreaScrollbarVisible ... /> : null;
\`\`\`

Non-obvious gotcha: the \`<style>\` block uses \`dangerouslySetInnerHTML\` with a \`nonce\` prop. This is for CSP-strict apps where inline styles must carry a nonce attribute. Without passing the right nonce, the style is rejected by CSP and native scrollbars become visible again. The nonce is opt-in — most apps don't need it, but if you have CSP errors about inline style, that's the prop to set.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['radix-ui', 'scroll-area', 'scrollbar', 'css', 'csp'],
    repository: repo,
    filePath: 'packages/react/scroll-area/src/scroll-area.tsx',
    url: `${baseUrl}/packages/react/scroll-area/src/scroll-area.tsx`,
  },
];
