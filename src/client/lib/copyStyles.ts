export function copyStyles(source: Document, target: Document): void {
  for (const sheet of Array.from(source.styleSheets)) {
    try {
      const cssText = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join('');
      const style = target.createElement('style');
      style.textContent = cssText;
      target.head.appendChild(style);
    } catch {
      const href = sheet.href;
      if (href) {
        const link = target.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        target.head.appendChild(link);
      }
    }
  }
}

export function syncTheme(target: Document, source: Document = document): void {
  const theme = source.documentElement.dataset.theme;
  if (theme) target.documentElement.dataset.theme = theme;
  else delete target.documentElement.dataset.theme;
}
