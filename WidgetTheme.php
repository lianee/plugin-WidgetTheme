<?php
/**
 * WidgetTheme: lets embedded widgets follow the visitor's browser theme.
 *
 * Matomo's Widgetize iframe template (plugins/Widgetize/templates/iframe.twig)
 * never sets data-theme-mode on <html>, unlike Morpheus/layout.twig, so widgets
 * always render light. jqPlot paints its canvas once, reading colours from CSS
 * variables, so the attribute must exist before the graph draws: we set it from
 * the <head> script emitted by the Template.jsGlobalVariables event.
 *
 * Default: auto (follows the browser). &themeMode=light or &themeMode=dark forces
 * a mode. Any other value is ignored (auto) with a console warning.
 *
 * &bgColor=rrggbb (or rgb, '#' optional) replaces the widget background, so the
 * widget blends into the host page. Absent: Matomo's own background. Any other
 * value is ignored with a console warning.
 */

namespace Piwik\Plugins\WidgetTheme;

use Piwik\Common;

class WidgetTheme extends \Piwik\Plugin
{
    private const FORCED_MODES = ['light', 'dark'];

    // Matomo variables that hold the widget background. In both light and dark
    // themes they share one value, so they are overridden together: otherwise the
    // period selector buttons and the title stay as patches of the old colour.
    private const BACKGROUND_VARS = [
        '--theme-color-widget-exported-background-base',
        '--theme-color-widget-background',
        '--theme-color-widget-title-background',
        '--theme-color-background-contrast',
    ];

    public function registerEvents()
    {
        return ['Template.jsGlobalVariables' => 'setThemeMode'];
    }

    public function setThemeMode(&$out)
    {
        if (Common::getRequestVar('module', '', 'string') !== 'Widgetize') {
            return;
        }

        // Read raw: getRequestVar() silently turns an array (themeMode[]=x) into
        // the default, and an invalid value must be reported, not swallowed.
        $param = $_GET['themeMode'] ?? null;
        $mode = 'auto';
        if (is_string($param) && in_array($param, self::FORCED_MODES, true)) {
            $mode = $param;
        } elseif ($param !== null) {
            // The value is not echoed: it is attacker-controlled.
            $out .= "\n    console.warn('WidgetTheme: invalid themeMode ignored (expected light or dark), using auto');";
        }

        $out .= "\n    document.documentElement.setAttribute('data-theme-mode', '" . $mode . "');\n";

        $out .= $this->backgroundScript($_GET['bgColor'] ?? null);
    }

    private function backgroundScript($param)
    {
        if ($param === null) {
            return '';
        }
        // Strict whitelist: the value ends up in CSS, so anything but plain hex
        // (names, rgb(), var(), url(), extra characters) is rejected, not cleaned.
        // \z, not $: $ would accept a trailing newline.
        if (!is_string($param) || !preg_match('/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\z/', $param, $m)) {
            return "    console.warn('WidgetTheme: invalid bgColor ignored (expected hex such as 1d1d1d)');\n";
        }
        $script = '';
        foreach (self::BACKGROUND_VARS as $var) {
            $script .= "    document.documentElement.style.setProperty('" . $var . "', '#" . $m[1] . "');\n";
        }
        return $script;
    }
}
