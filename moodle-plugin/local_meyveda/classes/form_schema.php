<?php
namespace local_meyveda;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->libdir . '/formslib.php');
require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->dirroot . '/course/modlib.php');

use moodle_exception;

/**
 * Reads Moodle's own activity/resource settings form (mod_<name>_mod_form) so YurCore can render exactly
 * the settings the installed Moodle defines, and submits them back through that same form, which means
 * Moodle's validation, defaults and add/update code paths decide what is saved. Nothing here invents fields.
 */
class form_schema {

    /** Element names YurCore does not render as plain fields (handled specially or not meaningful outside Moodle's UI). */
    private const SKIP_NAMES = ['availabilityconditionsjson', 'restrictgroupbutton', 'unlockcompletion', 'boundary_add_fields', 'tags', 'competencies'];
    private const SKIP_TYPES = ['hidden', 'submit', 'button', 'cancel', 'html', 'tags', 'autocomplete', 'grading'];

    private static function prop(object $o, string $name) {
        try {
            return (new \ReflectionProperty($o, $name))->getValue($o);
        } catch (\ReflectionException $e) {
            return null;
        }
    }

    private static function text($v): string {
        return trim(html_entity_decode(strip_tags((string)$v), ENT_QUOTES));
    }

    /** Names of modules an admin may add to this course, as listed by Moodle's "Add an activity or resource". */
    public static function addable_modules(\stdClass $course): array {
        $ctx = \context_course::instance($course->id);
        $out = [];
        foreach (get_module_types_names() as $name => $label) {
            if (!course_allowed_module($course, $name) || !has_capability("mod/$name:addinstance", $ctx)) {
                continue;
            }
            $arch = plugin_supports('mod', $name, FEATURE_MOD_ARCHETYPE, MOD_ARCHETYPE_OTHER);
            $help = '';
            try {
                $help = self::text(get_string('modulename_help', $name));
            } catch (\Throwable $e) {
                $help = '';
            }
            $out[] = [
                'name' => $name,
                'label' => (string)$label,
                'kind' => $arch == MOD_ARCHETYPE_RESOURCE ? 'resource' : 'activity',
                'help' => \core_text::substr($help, 0, 220),
            ];
        }
        return $out;
    }

    /** Opens Moodle's form for a new (cm null) or existing activity, with defaults applied. */
    public static function open(\stdClass $course, string $modname, int $section, ?\stdClass $cm = null): array {
        global $CFG, $PAGE;
        if (!$PAGE->has_set_url()) {
            $PAGE->set_url('/course/modedit.php');
        }
        // Moodle's form code reads the global course (e.g. to decide whether completion tracking is on).
        $PAGE->set_course($course);
        if ($cm) {
            [$cm, , , $data, $cw] = get_moduleinfo_data($cm, $course);
            $section = $cw->section;
        } else {
            [, , $cw, , $data] = prepare_new_moduleinfo_data($course, $modname, $section);
        }
        $file = "$CFG->dirroot/mod/$modname/mod_form.php";
        if (!is_readable($file)) {
            throw new moodle_exception('invalidparameter', 'error', '', null, 'Unknown activity type');
        }
        require_once($file);
        $class = "mod_{$modname}_mod_form";
        $form = new $class($data, $section, $cm, $course);
        $form->set_data($data);
        return [$form, $data, $cm, $class, $section];
    }

    /** Converts one QuickForm element; returns null when it is not something YurCore renders. */
    private static function convert(object $e, array $ctx): ?array {
        $type = $e->getType();
        $name = $e->getName();
        if (in_array($type, self::SKIP_TYPES, true) || in_array($name, self::SKIP_NAMES, true) || $type === 'header') {
            return null;
        }
        if (strpos($name, '[') !== false && !preg_match('/^\w+\[\d+\]$/', $name)) {
            return null;
        }
        $value = $ctx['value'];
        $label = $e->getLabel();
        $label = is_array($label) ? '' : self::text($label);
        $el = ['name' => $name, 'type' => $type, 'label' => $label, 'required' => isset($ctx['required'][$name])];
        $hb = $e->_helpbutton ?? '';
        if ($hb && preg_match('/identifier=(\w+)/', $hb, $i) && preg_match('/component=(\w+)/', $hb, $c)) {
            try {
                $el['help'] = \core_text::substr(self::text(get_string($i[1] . '_help', $c[1])), 0, 500);
            } catch (\Throwable $ex) {
                // Help text is optional.
            }
        }
        switch ($type) {
            case 'text': case 'url': case 'passwordunmask': case 'float': case 'textarea': case 'filetypes': case 'email':
                $v = $value($name);
                $el['type'] = $type === 'float' ? 'number' : ($type === 'textarea' ? 'textarea' : ($type === 'passwordunmask' ? 'password' : 'text'));
                if ($type === 'filetypes') {
                    $el['sub'] = 'filetypes'; // Submitted as name[filetypes].
                    $v = is_array($v) ? ($v['filetypes'] ?? '') : $v;
                }
                $el['value'] = is_scalar($v) ? (string)$v : '';
                return $el;
            case 'select': case 'selectyesno': case 'modvisible':
                $attrs = self::prop($e, '_attributes') ?? [];
                if (!empty($attrs['multiple'])) {
                    return null;
                }
                $opts = [];
                foreach ((array)self::prop($e, '_options') as $o) {
                    $opts[] = ['value' => (string)$o['attr']['value'], 'label' => self::text($o['text'])];
                }
                $v = $value($name);
                $el['type'] = 'select';
                $el['options'] = $opts;
                $el['value'] = $v === null ? ($opts[0]['value'] ?? '') : (string)$v;
                return $el;
            case 'checkbox': case 'advcheckbox':
                $el['type'] = 'checkbox';
                $el['adv'] = ($type === 'advcheckbox');
                $el['text'] = self::text($e->getText());
                $el['value'] = !empty($value($name)) ? 1 : 0;
                return $el;
            case 'date_time_selector': case 'date_selector':
                $el['type'] = 'datetime';
                $el['optional'] = !empty((self::prop($e, '_options') ?? [])['optional']);
                $el['value'] = (int)($value($name) ?? 0);
                return $el;
            case 'duration':
                $opts = self::prop($e, '_options') ?? [];
                $el['type'] = 'duration';
                $el['optional'] = !empty($opts['optional']);
                $el['units'] = [];
                foreach ($e->get_units() as $secs => $lbl) {
                    $el['units'][] = ['value' => (int)$secs, 'label' => $lbl];
                }
                $el['defaultUnit'] = (int)($opts['defaultunit'] ?? 60);
                $el['value'] = (int)($value($name) ?? 0);
                return $el;
            case 'editor':
                $v = $value($name);
                $el['type'] = 'editor';
                $el['value'] = is_array($v) ? (string)($v['text'] ?? '') : (string)($v ?? '');
                return $el;
            case 'filemanager': case 'filepicker':
                $el['type'] = 'file';
                $draft = (int)($ctx['data']->$name ?? 0);
                $el['files'] = [];
                if ($draft) {
                    $uctx = \context_user::instance($GLOBALS['USER']->id);
                    foreach (get_file_storage()->get_area_files($uctx->id, 'user', 'draft', $draft, 'filename', false) as $f) {
                        $el['files'][] = $f->get_filename();
                    }
                }
                return $el;
            case 'modgrade':
                $g = $value($name);
                $el['type'] = 'grade';
                $el['value'] = is_numeric($g) && $g > 0 ? (float)$g : 0;
                return $el;
            case 'radio':
                $el['type'] = 'radio';
                $el['value'] = (string)($value($name) ?? '');
                $el['options'] = [['value' => (string)($e->_attributes['value'] ?? ''), 'label' => self::text($e->getText())]];
                return $el;
            case 'static':
                $t = self::text(method_exists($e, 'getText') ? $e->getText() : ($e->_text ?? ''));
                if ($t === '') {
                    return null;
                }
                return ['name' => $name, 'type' => 'static', 'label' => $label, 'text' => $t];
        }
        return null;
    }

    /** Converts a list of elements, merging radio buttons of one name and a checkbox's trailing description. */
    private static function convert_list(array $elements, array $ctx, bool $ingroup = false): array {
        $out = [];
        foreach ($elements as $e) {
            $type = $e->getType();
            if ($type === 'group') {
                $children = self::convert_list($e->getElements(), $ctx, true);
                $glabel = $e->getLabel();
                $glabel = is_array($glabel) ? '' : self::text($glabel);
                if ($children) {
                    $out[] = ['name' => $e->getName(), 'type' => 'group', 'label' => $glabel, 'elements' => $children];
                }
                continue;
            }
            $el = self::convert($e, $ctx);
            if (!$el) {
                continue;
            }
            $last = count($out) - 1;
            if ($el['type'] === 'radio' && $last >= 0 && $out[$last]['type'] === 'radio' && $out[$last]['name'] === $el['name']) {
                $out[$last]['options'][] = $el['options'][0];
                continue;
            }
            if ($el['type'] === 'static' && $ingroup && $last >= 0 && $out[$last]['type'] === 'checkbox' && $out[$last]['text'] === '') {
                $out[$last]['text'] = $el['text'];
                continue;
            }
            $out[] = $el;
        }
        return $out;
    }

    /** Sections (in Moodle's order), server-side hidden defaults and YurCore-relevant rules for a form. */
    public static function describe(\moodleform $form, \stdClass $data): array {
        $q = self::prop($form, '_form');
        $defaults = self::prop($q, '_defaultValues') ?? [];
        $ctx = [
            'data' => $data,
            'required' => array_flip(self::prop($q, '_required') ?? []),
            'value' => function (string $name) use ($defaults, $data) {
                if (array_key_exists($name, $defaults)) {
                    return $defaults[$name];
                }
                if (preg_match('/^(\w+)\[(\d+)\]$/', $name, $m)) {
                    $base = $defaults[$m[1]] ?? ($data->{$m[1]} ?? null);
                    return is_array($base) ? ($base[(int)$m[2]] ?? null) : null;
                }
                return $data->$name ?? null;
            },
        ];
        $hidden = [];
        $sections = [];
        $cur = ['id' => 'general', 'title' => '', 'elements' => []];
        $chunk = [];
        $close = function () use (&$sections, &$cur, &$chunk, $ctx) {
            $cur['elements'] = self::convert_list($chunk, $ctx);
            if ($cur['elements']) {
                $sections[] = $cur;
            }
            $chunk = [];
        };
        foreach (self::prop($q, '_elements') ?? [] as $e) {
            $t = $e->getType();
            if ($t === 'header') {
                $close();
                $cur = ['id' => $e->getName(), 'title' => self::text($e->_text ?? $e->getName()), 'elements' => []];
            } else if ($t === 'hidden') {
                $hidden[$e->getName()] = $ctx['value']($e->getName()) ?? $e->getValue();
            } else {
                $chunk[] = $e;
            }
        }
        $close();

        // Conditional rules (disabledIf / hideIf) between plain named elements.
        $rules = [];
        foreach (['disable' => '_dependencies', 'hide' => '_hideifs'] as $kind => $propname) {
            foreach ((self::prop($q, $propname) ?? []) as $on => $conds) {
                foreach ($conds as $cond => $byvalue) {
                    foreach ($byvalue as $val => $targets) {
                        if (strpos((string)$on, '[') !== false) {
                            continue;
                        }
                        $targets = array_values(array_filter($targets, fn($t) => strpos((string)$t, '[') === false));
                        if ($targets) {
                            $rules[] = ['kind' => $kind, 'on' => $on, 'cond' => $cond, 'value' => (string)$val, 'targets' => $targets];
                        }
                    }
                }
            }
        }
        return ['sections' => $sections, 'rules' => $rules, 'hidden' => $hidden, 'quickform' => $q];
    }

    /** Flattens sections/groups to name => element. */
    private static function flatten(array $sections): array {
        $flat = [];
        $rec = function (array $els) use (&$rec, &$flat) {
            foreach ($els as $el) {
                if ($el['type'] === 'group') {
                    $rec($el['elements']);
                } else if ($el['type'] !== 'static') {
                    $flat[$el['name']] = $el;
                }
            }
        };
        foreach ($sections as $s) {
            $rec($s['elements']);
        }
        return $flat;
    }

    /** Turns YurCore's simple values into the raw request Moodle's form expects (dates as parts, editors as arrays...). */
    private static function compose(array $flat, array $hidden, array $rules, array $values, \stdClass $data, ?string $availability): array {
        $raw = [];
        foreach ($hidden as $k => $v) {
            if ($k !== 'sesskey' && strpos($k, '_qf__') !== 0) {
                $raw[$k] = $v;
            }
        }
        $put = function (string $name, $val) use (&$raw) {
            if (preg_match('/^(\\w+)\\[(\\d+)\\]$/', $name, $m)) {
                $raw[$m[1]][(int)$m[2]] = $val;
            } else {
                $raw[$name] = $val;
            }
        };
        foreach ($flat as $name => $el) {
            $v = array_key_exists($name, $values) ? $values[$name] : ($el['value'] ?? null);
            if (!empty($el['sub'])) {
                $put($name, [$el['sub'] => is_scalar($v) ? (string)$v : '']);
                continue;
            }
            switch ($el['type']) {
                case 'checkbox':
                    if (!empty($el['adv'])) {
                        $put($name, $v ? 1 : 0);
                    } else if ($v) {
                        $put($name, 1);
                    }
                    break;
                case 'datetime':
                    $ts = (int)$v;
                    if ($ts > 0 || empty($el['optional'])) {
                        $d = usergetdate($ts > 0 ? $ts : time());
                        $put($name, ['day' => $d['mday'], 'month' => $d['mon'], 'year' => $d['year'], 'hour' => $d['hours'], 'minute' => $d['minutes'], 'enabled' => 1]);
                    }
                    break;
                case 'duration':
                    $secs = (int)$v;
                    $unit = (int)($el['defaultUnit'] ?? 60);
                    if ($secs > 0) {
                        foreach (array_reverse(array_column($el['units'], 'value')) as $u) {
                            if ($u > 0 && $secs % $u === 0) {
                                $unit = $u;
                                break;
                            }
                        }
                        $put($name, ['number' => $secs / $unit, 'timeunit' => $unit, 'enabled' => 1]);
                    } else if (empty($el['optional'])) {
                        $put($name, ['number' => 0, 'timeunit' => $unit]);
                    }
                    break;
                case 'editor':
                    $put($name, ['text' => (string)$v, 'format' => FORMAT_HTML, 'itemid' => file_get_unused_draft_itemid()]);
                    break;
                case 'file':
                    $keep = (int)($data->$name ?? 0);
                    $put($name, is_numeric($v) && (int)$v > 0 ? (int)$v : ($keep ?: file_get_unused_draft_itemid()));
                    break;
                case 'grade':
                    $g = is_numeric($v) ? (float)$v : 0;
                    $point = $g > 0 ? (string)(floor($g) == $g ? (int)$g : $g) : '100';
                    $put($name, ['modgrade_type' => $g > 0 ? 'point' : 'none', 'modgrade_point' => $point, 'modgrade_scale' => '0']);
                    break;
                default:
                    $put($name, is_scalar($v) ? (string)$v : '');
            }
        }
        // Like a browser, never submit fields that Moodle's rules disable or hide (disabledIf / hideIf).
        for ($pass = 0; $pass < 3; $pass++) {
            foreach ($rules as $r) {
                $v = $raw[$r['on']] ?? null;
                $vs = is_array($v) ? '' : (string)$v;
                $active = match ($r['cond']) {
                    'checked' => !empty($v),
                    'notchecked' => empty($v),
                    'eq' => $vs === $r['value'],
                    'neq' => $vs !== $r['value'],
                    'in' => in_array($vs, explode('|', $r['value']), true),
                    default => false,
                };
                if ($active) {
                    foreach ($r['targets'] as $t) {
                        unset($raw[$t]);
                    }
                }
            }
        }
        if ($availability !== null) {
            $raw['availabilityconditionsjson'] = $availability;
        } else {
            $raw['availabilityconditionsjson'] = (string)($data->availabilityconditionsjson ?? '');
        }
        return $raw;
    }

    /**
     * Validates and saves an activity through Moodle's own form + add/update code. Returns
     * ['ok' => true, 'cmid' => n] or ['ok' => false, 'errors' => [field => message]].
     */
    public static function save(\stdClass $course, string $modname, int $section, ?\stdClass $cm, array $values, ?string $availability): array {
        [$form, $data, $cm2, $class, $sec] = self::open($course, $modname, $section, $cm);
        $desc = self::describe($form, $data);
        $flat = self::flatten($desc['sections']);
        $raw = self::compose($flat, $desc['hidden'], $desc['rules'], $values, $data, $availability);

        \moodleform::mock_submit($raw, [], 'post', $class);
        try {
            $form2 = new $class($data, $sec, $cm2, $course);
            $fd = $form2->get_data();
            if (!$fd) {
                $q2 = self::prop($form2, '_form');
                $errors = [];
                foreach ((array)self::prop($q2, '_errors') as $k => $msg) {
                    $errors[$k] = self::text($msg);
                }
                return ['ok' => false, 'errors' => $errors ?: ['_' => 'Moodle rejected these settings']];
            }
            if ($cm2) {
                update_moduleinfo($cm2, $fd, $course, $form2);
                return ['ok' => true, 'cmid' => (int)$cm2->id];
            }
            $res = add_moduleinfo($fd, $course, $form2);
            return ['ok' => true, 'cmid' => (int)$res->coursemodule];
        } finally {
            $_POST = [];
            $_FILES = [];
        }
    }
}
