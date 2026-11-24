# WidgetTheme (Matomo plugin)

Matomo 5 lets each user choose a theme mode (light, dark, match browser), but embedded widgets (`module=Widgetize&action=iframe`) ignore it: `plugins/Widgetize/templates/iframe.twig` never sets `data-theme-mode` on `<html>`, so widgets always render light.

Once activated, the plugin makes every embedded widget follow the visitor's system/browser theme. An embedded widget can be seen by anyone visiting the host page, most of them without a Matomo account, so Matomo's per-user theme preference cannot apply and the browser setting is the only reliable signal.

To force a mode, for instance for a widget embedded in a page that is always light, add a URL parameter:

```
&themeMode=light
&themeMode=dark
```

Any other value is ignored (the widget stays in automatic mode) and a warning is logged in the browser console.

Note: activating the plugin changes widgets already embedded elsewhere. Add `&themeMode=light` to keep the previous light rendering.

## Background colour

By default the widget keeps Matomo's background. To blend it into the host page, give the page's background colour in hexadecimal, 3 or 6 digits:

```
&bgColor=1d1d1d
```

Leave out the `#`: in a URL it starts the fragment, so `&bgColor=#1d1d1d` never reaches the server. `%231d1d1d` also works. Any other value (colour names, `rgb()`, 8 digits with alpha) is ignored and a warning is logged in the browser console.

The colour is fixed when the widget loads. If the host page switches between a light and a dark theme, it has to reload the widget with the matching colour, usually along with `themeMode`.

## Why a head script

jqPlot graphs are painted once on a `<canvas>`, with colours read from CSS variables at render time. Setting the attribute after load restyles the widget chrome but not the graph. The plugin emits the attribute from the `Template.jsGlobalVariables` event, which runs in a `<script>` inside `<head>`, before any graph is drawn.

Limitation: if the system theme changes while the page is open, the widget chrome follows but the graph keeps its colours until reload.

## Install

```bash
cp -r WidgetTheme /var/www/matomo/plugins/
chown -R www-data:www-data /var/www/matomo/plugins/WidgetTheme
sudo -u www-data php /var/www/matomo/console plugin:activate WidgetTheme
```

The directory name must be `WidgetTheme`. Tested on Matomo 5.14.2 and 6.0.0.

## Tests

`tests/render.test.cjs` renders a widget in headless Chromium against a Matomo instance where the plugin is active, and checks the theme mode, the computed backgrounds, the console warnings and that hostile values never reach the plugin's script:

```bash
MATOMO_URL=https://matomo.example.com MATOMO_TOKEN=<token with view access> MATOMO_IDSITE=1 \
  node tests/render.test.cjs
```

It needs the `playwright` package (`npm install playwright`, or point `PLAYWRIGHT` at an existing `node_modules/playwright`).

## License

[MIT](LICENSE), © 2026 Liane.
