<?php
namespace local_meyveda\external;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->libdir . '/externallib.php');
require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->dirroot . '/course/modlib.php');
require_once($CFG->libdir . '/questionlib.php');
require_once($CFG->libdir . '/resourcelib.php');
require_once($CFG->dirroot . '/mod/resource/locallib.php');
require_once($CFG->libdir . '/completionlib.php');
require_once($CFG->dirroot . '/mod/quiz/locallib.php');

use external_api;
use external_function_parameters;
use external_value;
use context_course;
use context_module;
use moodle_exception;

/**
 * Authoring bridge for YurCore. Every function returns a JSON string so the YurCore backend
 * can evolve its payloads without re-registering Moodle web-service structures.
 * All functions run as the web-service token user and check Moodle capabilities.
 */
class api extends external_api {

    // ---------------------------------------------------------------- helpers

    private static function json_out($data): string {
        return json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    private static function json_in(string $json): array {
        $d = json_decode($json, true);
        if (!is_array($d)) {
            throw new moodle_exception('invalidjson', 'error', '', null, 'Invalid JSON payload');
        }
        return $d;
    }

    private static function course_ctx(int $courseid, string $cap) {
        global $DB;
        $course = $DB->get_record('course', ['id' => $courseid], '*', MUST_EXIST);
        $ctx = context_course::instance($courseid);
        self::validate_context($ctx);
        require_capability($cap, $ctx);
        return [$course, $ctx];
    }

    private static function cm_ctx(int $cmid, string $cap = 'moodle/course:manageactivities') {
        global $DB;
        $cm = get_coursemodule_from_id('', $cmid, 0, false, MUST_EXIST);
        $course = $DB->get_record('course', ['id' => $cm->course], '*', MUST_EXIST);
        $ctx = context_module::instance($cmid);
        self::validate_context($ctx);
        require_capability($cap, $ctx);
        return [$cm, $course, $ctx];
    }

    private static function editor(string $html): array {
        return ['text' => $html, 'format' => FORMAT_HTML, 'itemid' => 0];
    }

    /**
     * Availability JSON from {from, until, afterCmid}. Conditions Moodle supports but YurCore's editor does not
     * (grade, group, profile...) that already exist on the activity are kept untouched.
     */
    private static function availability_json(array $a, ?string $existing = null): string {
        $c = [];
        if ($existing) {
            $old = json_decode($existing, true);
            foreach (($old['c'] ?? []) as $cond) {
                if (!in_array($cond['type'] ?? '', ['date', 'completion'], true)) {
                    $c[] = $cond;
                }
            }
        }
        if (!empty($a['from'])) { $c[] = ['type' => 'date', 'd' => '>=', 't' => (int)$a['from']]; }
        if (!empty($a['until'])) { $c[] = ['type' => 'date', 'd' => '<', 't' => (int)$a['until']]; }
        if (!empty($a['afterCmid'])) { $c[] = ['type' => 'completion', 'cm' => (int)$a['afterCmid'], 'e' => 1]; }
        if (!$c) {
            return '';
        }
        return json_encode(['op' => '&', 'c' => $c, 'showc' => array_fill(0, count($c), true)]);
    }

    /** Reverse of availability_json for the conditions YurCore knows how to edit. */
    private static function availability_parse(?string $json): array {
        $out = ['from' => null, 'until' => null, 'afterCmid' => null];
        if (!$json) {
            return $out;
        }
        $t = json_decode($json, true);
        foreach (($t['c'] ?? []) as $c) {
            if (($c['type'] ?? '') === 'date') {
                $out[($c['d'] ?? '') === '>=' ? 'from' : 'until'] = (int)$c['t'];
            } else if (($c['type'] ?? '') === 'completion') {
                $out['afterCmid'] = (int)$c['cm'];
            }
        }
        return $out;
    }

    /** Moodle's completion tracking on an activity: none, manual (learner ticks it) or auto (conditions). */
    private static function completion_mode(\stdClass $cm): string {
        return [COMPLETION_TRACKING_MANUAL => 'manual', COMPLETION_TRACKING_AUTOMATIC => 'auto'][(int)$cm->completion] ?? 'none';
    }

    // ---------------------------------------------------------------- structure

    public static function get_course_structure_parameters() {
        return new external_function_parameters(['courseid' => new external_value(PARAM_INT, 'Course id')]);
    }

    public static function get_course_structure(int $courseid) {
        global $DB;
        ['courseid' => $courseid] = self::validate_parameters(self::get_course_structure_parameters(), ['courseid' => $courseid]);
        [$course] = self::course_ctx($courseid, 'moodle/course:manageactivities');
        $modinfo = get_fast_modinfo($course);
        $sections = [];
        foreach ($modinfo->get_section_info_all() as $num => $sec) {
            $acts = [];
            foreach (($modinfo->sections[$num] ?? []) as $cmid) {
                $cm = $modinfo->get_cm($cmid);
                if ($cm->deletioninprogress) {
                    continue;
                }
                $acts[] = self::activity_summary($cm);
            }
            $sections[] = [
                'id' => (int)$sec->id, 'section' => (int)$num,
                'name' => get_section_name($course, $sec), 'summary' => $sec->summary ?? '',
                'visible' => (bool)$sec->visible, 'activities' => $acts,
            ];
        }
        return self::json_out(['sections' => $sections]);
    }

    public static function get_course_structure_returns() {
        return new external_value(PARAM_RAW, 'JSON');
    }

    private static function activity_summary(\cm_info $cm): array {
        global $DB;
        $inst = $DB->get_record($cm->modname, ['id' => $cm->instance]);
        $row = [
            'cmid' => (int)$cm->id, 'instance' => (int)$cm->instance, 'modname' => $cm->modname, 'name' => $cm->name,
            'visible' => (bool)$cm->visible,
            'completion' => self::completion_mode($cm->get_course_module_record(true)),
            'availability' => self::availability_parse($cm->availability),
            'url' => $cm->url ? $cm->url->out(false) : null, 'dates' => [],
        ];
        if ($cm->modname === 'quiz') {
            $row['dates'] = ['open' => (int)$inst->timeopen, 'close' => (int)$inst->timeclose];
            $row['questions'] = (int)$DB->count_records('quiz_slots', ['quizid' => $inst->id]);
            $row['timelimit'] = (int)$inst->timelimit;
        } else if ($cm->modname === 'assign') {
            $row['dates'] = ['open' => (int)$inst->allowsubmissionsfromdate, 'due' => (int)$inst->duedate];
        }
        return $row;
    }

    // ---------------------------------------------------------------- activity forms (Moodle's own settings)

    public static function get_addable_modules_parameters() {
        return new external_function_parameters(['courseid' => new external_value(PARAM_INT, 'Course id')]);
    }

    /** The modules Moodle offers under "Add an activity or resource" for this course. */
    public static function get_addable_modules(int $courseid) {
        ['courseid' => $courseid] = self::validate_parameters(self::get_addable_modules_parameters(), ['courseid' => $courseid]);
        [$course] = self::course_ctx($courseid, 'moodle/course:manageactivities');
        return self::json_out(['modules' => \local_meyveda\form_schema::addable_modules($course)]);
    }

    public static function get_addable_modules_returns() {
        return new external_value(PARAM_RAW, 'JSON');
    }

    public static function get_activity_form_parameters() {
        return new external_function_parameters([
            'courseid' => new external_value(PARAM_INT, 'Course id'),
            'modname' => new external_value(PARAM_PLUGIN, 'Module name (ignored when cmid is given)', VALUE_DEFAULT, ''),
            'section' => new external_value(PARAM_INT, 'Section number for a new activity', VALUE_DEFAULT, 0),
            'cmid' => new external_value(PARAM_INT, 'Existing course module id (0 = new)', VALUE_DEFAULT, 0),
        ]);
    }

    /** The installed Moodle's settings form for an activity, with current/default values. */
    public static function get_activity_form(int $courseid, string $modname = '', int $section = 0, int $cmid = 0) {
        global $DB;
        $p = self::validate_parameters(self::get_activity_form_parameters(), compact('courseid', 'modname', 'section', 'cmid'));
        $cm = null;
        if ($p['cmid']) {
            [$cm, $course] = self::cm_ctx($p['cmid']);
            if ((int)$cm->course !== (int)$p['courseid']) {
                throw new moodle_exception('invalidparameter', 'error', '', null, 'Activity is not in this course');
            }
            $modname = $cm->modname;
        } else {
            [$course] = self::course_ctx($p['courseid'], 'moodle/course:manageactivities');
            $modname = $p['modname'];
            if (!in_array($modname, array_column(\local_meyveda\form_schema::addable_modules($course), 'name'))) {
                throw new moodle_exception('invalidparameter', 'error', '', null, 'This activity type is not available');
            }
        }
        [$form, $data] = \local_meyveda\form_schema::open($course, $modname, $p['section'], $cm);
        $d = \local_meyveda\form_schema::describe($form, $data);
        return self::json_out([
            'modname' => $modname,
            'label' => get_string('pluginname', $modname),
            'cmid' => $cm ? (int)$cm->id : 0,
            'sections' => $d['sections'],
            'rules' => $d['rules'],
            'availability' => self::availability_parse($data->availabilityconditionsjson ?? null),
        ]);
    }

    public static function get_activity_form_returns() {
        return new external_value(PARAM_RAW, 'JSON');
    }

    public static function save_activity_parameters() {
        return new external_function_parameters([
            'courseid' => new external_value(PARAM_INT, 'Course id'),
            'modname' => new external_value(PARAM_PLUGIN, 'Module name (new activities)', VALUE_DEFAULT, ''),
            'section' => new external_value(PARAM_INT, 'Section number (new activities)', VALUE_DEFAULT, 0),
            'cmid' => new external_value(PARAM_INT, 'Existing course module id (0 = new)', VALUE_DEFAULT, 0),
            'values' => new external_value(PARAM_RAW, 'JSON object of field values'),
            'availability' => new external_value(PARAM_RAW, 'JSON {from,until,afterCmid} or empty to leave unchanged', VALUE_DEFAULT, ''),
        ]);
    }

    /** Validates and saves through Moodle's form. Returns {ok, cmid} or {ok:false, errors}. */
    public static function save_activity(int $courseid, string $modname = '', int $section = 0, int $cmid = 0, string $values = '{}', string $availability = '') {
        $p = self::validate_parameters(self::save_activity_parameters(), compact('courseid', 'modname', 'section', 'cmid', 'values', 'availability'));
        $vals = self::json_in($p['values']);
        $cm = null;
        if ($p['cmid']) {
            [$cm, $course] = self::cm_ctx($p['cmid']);
            if ((int)$cm->course !== (int)$p['courseid']) {
                throw new moodle_exception('invalidparameter', 'error', '', null, 'Activity is not in this course');
            }
            $modname = $cm->modname;
        } else {
            [$course] = self::course_ctx($p['courseid'], 'moodle/course:manageactivities');
            $modname = $p['modname'];
            if (!in_array($modname, array_column(\local_meyveda\form_schema::addable_modules($course), 'name'))) {
                throw new moodle_exception('invalidparameter', 'error', '', null, 'This activity type is not available');
            }
            course_create_sections_if_missing($course, [$p['section']]);
        }
        $avail = null;
        if ($p['availability'] !== '') {
            $a = self::json_in($p['availability']);
            $existing = null;
            if ($cm) {
                $existing = $cm->availability ?? null;
            }
            $avail = self::availability_json($a, $existing);
        }
        return self::json_out(\local_meyveda\form_schema::save($course, $modname, $p['section'], $cm, $vals, $avail));
    }

    public static function save_activity_returns() {
        return new external_value(PARAM_RAW, 'JSON');
    }

    public static function set_activity_visibility_parameters() {
        return new external_function_parameters([
            'cmid' => new external_value(PARAM_INT, 'Course module id'),
            'visible' => new external_value(PARAM_BOOL, 'Show (true) or hide (false)'),
        ]);
    }

    public static function set_activity_visibility(int $cmid, bool $visible) {
        $p = self::validate_parameters(self::set_activity_visibility_parameters(), compact('cmid', 'visible'));
        self::cm_ctx($p['cmid'], 'moodle/course:activityvisibility');
        set_coursemodule_visible($p['cmid'], $p['visible'] ? 1 : 0);
        return self::json_out(['ok' => true]);
    }

    public static function set_activity_visibility_returns() {
        return new external_value(PARAM_RAW, 'JSON');
    }

    public static function delete_activity_parameters() {
        return new external_function_parameters(['cmid' => new external_value(PARAM_INT, 'Course module id')]);
    }

    public static function delete_activity(int $cmid) {
        ['cmid' => $cmid] = self::validate_parameters(self::delete_activity_parameters(), ['cmid' => $cmid]);
        self::cm_ctx($cmid);
        course_delete_module($cmid);
        return self::json_out(['ok' => true]);
    }

    public static function delete_activity_returns() {
        return new external_value(PARAM_RAW, 'JSON');
    }

    public static function move_activity_parameters() {
        return new external_function_parameters([
            'cmid' => new external_value(PARAM_INT, 'Course module id'),
            'section' => new external_value(PARAM_INT, 'Target section number'),
            'beforecmid' => new external_value(PARAM_INT, 'Place before this cmid (0 = end)', VALUE_DEFAULT, 0),
        ]);
    }

    public static function move_activity(int $cmid, int $section, int $beforecmid = 0) {
        global $DB;
        $p = self::validate_parameters(self::move_activity_parameters(), compact('cmid', 'section', 'beforecmid'));
        [$cm, $course] = self::cm_ctx($p['cmid']);
        course_create_sections_if_missing($course, [$p['section']]);
        $sec = $DB->get_record('course_sections', ['course' => $course->id, 'section' => $p['section']], '*', MUST_EXIST);
        $before = null;
        if ($p['beforecmid']) {
            $before = get_coursemodule_from_id('', $p['beforecmid'], $course->id, false, MUST_EXIST);
        }
        moveto_module($cm, $sec, $before);
        return self::json_out(['ok' => true]);
    }

    public static function move_activity_returns() {
        return new external_value(PARAM_RAW, 'JSON');
    }

    // ---------------------------------------------------------------- sections

    public static function add_section_parameters() {
        return new external_function_parameters([
            'courseid' => new external_value(PARAM_INT, 'Course id'),
            'name' => new external_value(PARAM_TEXT, 'Section name', VALUE_DEFAULT, ''),
        ]);
    }

    public static function add_section(int $courseid, string $name = '') {
        $p = self::validate_parameters(self::add_section_parameters(), compact('courseid', 'name'));
        [$course] = self::course_ctx($p['courseid'], 'moodle/course:update');
        $section = course_create_section($course);
        if ($p['name'] !== '') {
            course_update_section($course, $section, ['name' => $p['name']]);
        }
        return self::json_out(['id' => (int)$section->id, 'section' => (int)$section->section]);
    }

    public static function add_section_returns() {
        return new external_value(PARAM_RAW, 'JSON');
    }

    public static function update_section_parameters() {
        return new external_function_parameters([
            'courseid' => new external_value(PARAM_INT, 'Course id'),
            'section' => new external_value(PARAM_INT, 'Section number'),
            'name' => new external_value(PARAM_TEXT, 'Name'),
            'summary' => new external_value(PARAM_RAW, 'Summary HTML', VALUE_DEFAULT, null),
        ]);
    }

    public static function update_section(int $courseid, int $section, string $name, ?string $summary = null) {
        global $DB;
        $p = self::validate_parameters(self::update_section_parameters(), compact('courseid', 'section', 'name', 'summary'));
        [$course] = self::course_ctx($p['courseid'], 'moodle/course:update');
        $sec = $DB->get_record('course_sections', ['course' => $course->id, 'section' => $p['section']], '*', MUST_EXIST);
        $data = ['name' => $p['name']];
        if ($p['summary'] !== null) {
            $data['summary'] = $p['summary'];
            $data['summaryformat'] = FORMAT_HTML;
        }
        course_update_section($course, $sec, $data);
        return self::json_out(['ok' => true]);
    }

    public static function update_section_returns() {
        return new external_value(PARAM_RAW, 'JSON');
    }

    public static function delete_section_parameters() {
        return new external_function_parameters([
            'courseid' => new external_value(PARAM_INT, 'Course id'),
            'section' => new external_value(PARAM_INT, 'Section number (>0)'),
        ]);
    }

    public static function delete_section(int $courseid, int $section) {
        $p = self::validate_parameters(self::delete_section_parameters(), compact('courseid', 'section'));
        [$course] = self::course_ctx($p['courseid'], 'moodle/course:update');
        if ($p['section'] < 1) {
            throw new moodle_exception('invalidparameter', 'error', '', null, 'The general section cannot be deleted');
        }
        course_delete_section($course, $p['section'], true);
        return self::json_out(['ok' => true]);
    }

    public static function delete_section_returns() {
        return new external_value(PARAM_RAW, 'JSON');
    }

    public static function move_section_parameters() {
        return new external_function_parameters([
            'courseid' => new external_value(PARAM_INT, 'Course id'),
            'section' => new external_value(PARAM_INT, 'Section number (>0)'),
            'destination' => new external_value(PARAM_INT, 'New section number (>0)'),
        ]);
    }

    public static function move_section(int $courseid, int $section, int $destination) {
        $p = self::validate_parameters(self::move_section_parameters(), compact('courseid', 'section', 'destination'));
        [$course] = self::course_ctx($p['courseid'], 'moodle/course:update');
        if ($p['section'] < 1 || $p['destination'] < 1) {
            throw new moodle_exception('invalidparameter', 'error', '', null, 'The general section cannot be moved');
        }
        move_section_to($course, $p['section'], $p['destination']);
        return self::json_out(['ok' => true]);
    }

    public static function move_section_returns() {
        return new external_value(PARAM_RAW, 'JSON');
    }

    // ---------------------------------------------------------------- quiz questions

    private static function quiz_questions(int $quizid): array {
        global $DB;
        $out = [];
        $slots = $DB->get_records('quiz_slots', ['quizid' => $quizid], 'slot');
        foreach ($slots as $slot) {
            $ref = $DB->get_record('question_references', ['itemid' => $slot->id, 'component' => 'mod_quiz', 'questionarea' => 'slot']);
            if (!$ref) { continue; }
            $sql = "SELECT qv.questionid FROM {question_versions} qv
                     WHERE qv.questionbankentryid = :e ORDER BY qv.version DESC";
            $qid = $DB->get_field_sql($sql, ['e' => $ref->questionbankentryid], IGNORE_MULTIPLE);
            if (!$qid) { continue; }
            $q = \question_bank::load_question_data($qid);
            $row = [
                'slot' => (int)$slot->slot, 'id' => (int)$q->id, 'type' => $q->qtype, 'name' => $q->name,
                'text' => $q->questiontext, 'mark' => (float)$slot->maxmark,
            ];
            if ($q->qtype === 'multichoice') {
                $row['single'] = (bool)$q->options->single;
                $row['answers'] = array_values(array_map(fn($a) => ['text' => strip_tags($a->answer), 'correct' => $a->fraction > 0], $q->options->answers));
            } else if ($q->qtype === 'truefalse') {
                $row['correct'] = ((int)$q->options->trueanswer !== 0) && ($q->options->answers[$q->options->trueanswer]->fraction > 0);
            } else if ($q->qtype === 'shortanswer') {
                $row['answers'] = array_values(array_map(fn($a) => ['text' => $a->answer, 'correct' => $a->fraction > 0], $q->options->answers));
            }
            $out[] = $row;
        }
        return $out;
    }

    /** Builds the question-form object for the supported types. */
    private static function question_form(array $d, \stdClass $cat): \stdClass {
        $type = $d['type'] ?? '';
        if (!in_array($type, ['multichoice', 'truefalse', 'shortanswer'])) {
            throw new moodle_exception('invalidparameter', 'error', '', null, 'Unsupported question type');
        }
        $text = trim((string)($d['text'] ?? ''));
        if ($text === '') {
            throw new moodle_exception('invalidparameter', 'error', '', null, 'Question text is required');
        }
        $f = new \stdClass();
        $f->category = $cat->id . ',' . $cat->contextid;
        $f->name = shorten_text(strip_tags($text), 80);
        $f->questiontext = ['text' => '<p>' . s($text) . '</p>', 'format' => FORMAT_HTML];
        $f->defaultmark = (float)($d['mark'] ?? 1);
        $f->generalfeedback = ['text' => '', 'format' => FORMAT_HTML];
        $f->penalty = 0.3333333;
        $f->status = \core_question\local\bank\question_version_status::QUESTION_STATUS_READY;
        $f->idnumber = null;
        $f->tags = [];
        $f->qtype = $type;
        $empty = ['text' => '', 'format' => FORMAT_HTML];
        if ($type === 'multichoice') {
            $answers = array_values(array_filter($d['answers'] ?? [], fn($a) => trim($a['text'] ?? '') !== ''));
            if (count($answers) < 2) {
                throw new moodle_exception('invalidparameter', 'error', '', null, 'Provide at least two answer options');
            }
            $correct = count(array_filter($answers, fn($a) => !empty($a['correct'])));
            if ($correct < 1) {
                throw new moodle_exception('invalidparameter', 'error', '', null, 'Mark at least one correct answer');
            }
            $single = $correct === 1;
            $f->single = $single ? 1 : 0;
            $f->shuffleanswers = 1;
            $f->answernumbering = 'abc';
            $f->showstandardinstruction = 0;
            $f->correctfeedback = $empty;
            $f->partiallycorrectfeedback = $empty;
            $f->incorrectfeedback = $empty;
            $f->shownumcorrect = 0;
            $f->answer = [];
            $f->fraction = [];
            $f->feedback = [];
            foreach ($answers as $a) {
                $f->answer[] = ['text' => s($a['text']), 'format' => FORMAT_HTML];
                $f->fraction[] = !empty($a['correct']) ? ($single ? '1.0' : (string)round(1 / $correct, 7)) : ($single ? '0.0' : '-1.0');
                $f->feedback[] = $empty;
            }
        } else if ($type === 'truefalse') {
            $f->correctanswer = !empty($d['correct']) ? 1 : 0;
            $f->feedbacktrue = $empty;
            $f->feedbackfalse = $empty;
        } else {
            $answers = array_values(array_filter($d['answers'] ?? [], fn($a) => trim($a['text'] ?? '') !== ''));
            if (!$answers) {
                throw new moodle_exception('invalidparameter', 'error', '', null, 'Provide at least one accepted answer');
            }
            $f->usecase = 0;
            $f->answer = array_map(fn($a) => $a['text'], $answers);
            $f->fraction = array_fill(0, count($answers), '1.0');
            $f->feedback = array_fill(0, count($answers), $empty);
        }
        return $f;
    }

    public static function add_quiz_question_parameters() {
        return new external_function_parameters([
            'cmid' => new external_value(PARAM_INT, 'Quiz course module id'),
            'data' => new external_value(PARAM_RAW, 'JSON payload'),
        ]);
    }

    public static function add_quiz_question(int $cmid, string $data) {
        global $DB, $USER;
        $p = self::validate_parameters(self::add_quiz_question_parameters(), compact('cmid', 'data'));
        [$cm, $course, $ctx] = self::cm_ctx($p['cmid']);
        if ($cm->modname !== 'quiz') {
            throw new moodle_exception('invalidparameter', 'error', '', null, 'Not a quiz');
        }
        $quiz = $DB->get_record('quiz', ['id' => $cm->instance], '*', MUST_EXIST);
        $d = self::json_in($p['data']);
        // New questions live in the course's question bank so other quizzes can reuse them.
        $cctx = context_course::instance($course->id);
        $cat = question_get_default_category($cctx->id, true);
        if (!$cat) {
            $cats = question_make_default_categories([$cctx]);
            $cat = $cats ?: question_get_default_category($cctx->id);
        }
        if (!$cat) {
            throw new moodle_exception('invalidparameter', 'error', '', null, 'No question category available for this quiz');
        }
        $form = self::question_form($d, $cat);
        $question = new \stdClass();
        $question->category = $cat->id;
        $question->qtype = $form->qtype;
        $question->createdby = $USER->id;
        $question->timecreated = time();
        $question->contextid = $cctx->id;
        $qtype = \question_bank::get_qtype($form->qtype);
        $question = $qtype->save_question($question, $form);
        quiz_add_quiz_question($question->id, $quiz, 0, $form->defaultmark);
        quiz_delete_previews($quiz);
        return self::json_out(['id' => (int)$question->id, 'questions' => self::quiz_questions($quiz->id)]);
    }

    public static function add_quiz_question_returns() {
        return new external_value(PARAM_RAW, 'JSON');
    }

    public static function update_quiz_question_parameters() {
        return new external_function_parameters([
            'cmid' => new external_value(PARAM_INT, 'Quiz course module id'),
            'slot' => new external_value(PARAM_INT, 'Slot number'),
            'data' => new external_value(PARAM_RAW, 'JSON payload'),
        ]);
    }

    /** Edits a question by replacing it in the same slot (keeps grading history simple: new version, same slot). */
    public static function update_quiz_question(int $cmid, int $slot, string $data) {
        global $DB;
        $p = self::validate_parameters(self::update_quiz_question_parameters(), compact('cmid', 'slot', 'data'));
        [$cm] = self::cm_ctx($p['cmid']);
        $quiz = $DB->get_record('quiz', ['id' => $cm->instance], '*', MUST_EXIST);
        $exists = $DB->record_exists('quiz_slots', ['quizid' => $quiz->id, 'slot' => $p['slot']]);
        if (!$exists) {
            throw new moodle_exception('invalidparameter', 'error', '', null, 'Question not found');
        }
        $before = array_values(array_map(fn($r) => (int)$r->id, $DB->get_records('quiz_slots', ['quizid' => $quiz->id], 'slot', 'id')));
        $position = $p['slot'] - 1; // zero-based index the edited question occupied
        self::delete_quiz_question_impl($cm, $p['slot']);
        $res = json_decode(self::add_quiz_question($cmid, $data), true);
        // The replacement lands at the end: move it back to the position the edited question occupied.
        $slots = array_values($DB->get_records('quiz_slots', ['quizid' => $quiz->id], 'slot'));
        $new = end($slots);
        $others = array_values(array_filter($before, fn($id) => $id !== ($before[$position] ?? 0)));
        if ($new && $position < count($others)) {
            $previd = $position > 0 ? $others[$position - 1] : 0;
            $page = $previd ? (int)$DB->get_field('quiz_slots', 'page', ['id' => $previd]) : 1;
            $structure = \mod_quiz\structure::create_for_quiz(\mod_quiz\quiz_settings::create($quiz->id));
            $structure->move_slot((int)$new->id, $previd, $page);
            $res['questions'] = self::quiz_questions($quiz->id);
        }
        return self::json_out($res);
    }

    public static function update_quiz_question_returns() {
        return new external_value(PARAM_RAW, 'JSON');
    }

    private static function delete_quiz_question_impl(\stdClass $cm, int $slot): void {
        global $DB;
        $quiz = $DB->get_record('quiz', ['id' => $cm->instance], '*', MUST_EXIST);
        $quizobj = \mod_quiz\quiz_settings::create($quiz->id);
        $structure = \mod_quiz\structure::create_for_quiz($quizobj);
        $structure->remove_slot($slot);
        quiz_delete_previews($quiz);
        quiz_update_sumgrades($quiz);
    }

    public static function delete_quiz_question_parameters() {
        return new external_function_parameters([
            'cmid' => new external_value(PARAM_INT, 'Quiz course module id'),
            'slot' => new external_value(PARAM_INT, 'Slot number'),
        ]);
    }

    public static function delete_quiz_question(int $cmid, int $slot) {
        global $DB;
        $p = self::validate_parameters(self::delete_quiz_question_parameters(), compact('cmid', 'slot'));
        [$cm] = self::cm_ctx($p['cmid']);
        self::delete_quiz_question_impl($cm, $p['slot']);
        return self::json_out(['questions' => self::quiz_questions((int)$cm->instance)]);
    }

    public static function delete_quiz_question_returns() {
        return new external_value(PARAM_RAW, 'JSON');
    }

    public static function get_quiz_parameters() {
        return new external_function_parameters(['cmid' => new external_value(PARAM_INT, 'Quiz course module id')]);
    }

    public static function get_quiz(int $cmid) {
        global $DB;
        ['cmid' => $cmid] = self::validate_parameters(self::get_quiz_parameters(), ['cmid' => $cmid]);
        [$cm] = self::cm_ctx($cmid);
        if ($cm->modname !== 'quiz') {
            throw new moodle_exception('invalidparameter', 'error', '', null, 'Not a quiz');
        }
        $quiz = $DB->get_record('quiz', ['id' => $cm->instance], '*', MUST_EXIST);
        return self::json_out(['questions' => self::quiz_questions($quiz->id), 'grade' => (float)$quiz->grade, 'sumgrades' => (float)$quiz->sumgrades]);
    }

    public static function get_quiz_returns() {
        return new external_value(PARAM_RAW, 'JSON');
    }

    public static function get_question_bank_parameters() {
        return new external_function_parameters(['cmid' => new external_value(PARAM_INT, 'Quiz course module id')]);
    }

    /** Questions in this course's Moodle question bank (course + quiz level), grouped by category. */
    public static function get_question_bank(int $cmid) {
        global $DB;
        ['cmid' => $cmid] = self::validate_parameters(self::get_question_bank_parameters(), ['cmid' => $cmid]);
        [$cm, $course] = self::cm_ctx($cmid);
        $ctxids = [context_course::instance($course->id)->id, context_module::instance($cmid)->id];
        [$in, $params] = $DB->get_in_or_equal($ctxids);
        $out = [];
        foreach ($DB->get_records_select('question_categories', "contextid $in", $params, 'name') as $cat) {
            $sql = "SELECT q.id, q.name, q.qtype, q.questiontext, q.defaultmark
                      FROM {question_bank_entries} qbe
                      JOIN {question_versions} qv ON qv.questionbankentryid = qbe.id
                                                 AND qv.version = (SELECT MAX(v.version) FROM {question_versions} v WHERE v.questionbankentryid = qbe.id)
                      JOIN {question} q ON q.id = qv.questionid
                     WHERE qbe.questioncategoryid = :cat AND qv.status <> 'hidden' AND q.parent = 0
                  ORDER BY q.name";
            $qs = [];
            foreach ($DB->get_records_sql($sql, ['cat' => $cat->id]) as $q) {
                $qs[] = ['id' => (int)$q->id, 'name' => $q->name, 'type' => $q->qtype, 'text' => \core_text::substr(trim(strip_tags($q->questiontext)), 0, 160), 'mark' => (float)$q->defaultmark];
            }
            if ($qs) {
                $out[] = ['id' => (int)$cat->id, 'name' => $cat->name, 'questions' => $qs];
            }
        }
        return self::json_out(['categories' => $out]);
    }

    public static function get_question_bank_returns() {
        return new external_value(PARAM_RAW, 'JSON');
    }

    public static function add_bank_question_parameters() {
        return new external_function_parameters([
            'cmid' => new external_value(PARAM_INT, 'Quiz course module id'),
            'questionid' => new external_value(PARAM_INT, 'Question id from the question bank'),
            'mark' => new external_value(PARAM_FLOAT, 'Maximum mark (0 = question default)', VALUE_DEFAULT, 0),
        ]);
    }

    /** Adds an existing question bank question to the quiz. */
    public static function add_bank_question(int $cmid, int $questionid, float $mark = 0) {
        global $DB;
        $p = self::validate_parameters(self::add_bank_question_parameters(), compact('cmid', 'questionid', 'mark'));
        [$cm, $course] = self::cm_ctx($p['cmid']);
        if ($cm->modname !== 'quiz') {
            throw new moodle_exception('invalidparameter', 'error', '', null, 'Not a quiz');
        }
        $quiz = $DB->get_record('quiz', ['id' => $cm->instance], '*', MUST_EXIST);
        $q = $DB->get_record('question', ['id' => $p['questionid']], '*', MUST_EXIST);
        $catctx = $DB->get_field_sql("SELECT qc.contextid FROM {question_categories} qc
                                        JOIN {question_bank_entries} qbe ON qbe.questioncategoryid = qc.id
                                        JOIN {question_versions} qv ON qv.questionbankentryid = qbe.id
                                       WHERE qv.questionid = ?", [$q->id]);
        if (!in_array((int)$catctx, [context_course::instance($course->id)->id, context_module::instance($cmid)->id], true)) {
            throw new moodle_exception('nopermissions', 'error', '', 'use this question');
        }
        quiz_add_quiz_question($q->id, $quiz, 0, $p['mark'] > 0 ? $p['mark'] : null);
        quiz_delete_previews($quiz);
        return self::json_out(['questions' => self::quiz_questions($quiz->id)]);
    }

    public static function add_bank_question_returns() {
        return new external_value(PARAM_RAW, 'JSON');
    }

    // ---------------------------------------------------------------- course image

    public static function set_course_image_parameters() {
        return new external_function_parameters([
            'courseid' => new external_value(PARAM_INT, 'Course id'),
            'draftitemid' => new external_value(PARAM_INT, 'Draft area item id from webservice/upload.php'),
        ]);
    }

    public static function set_course_image(int $courseid, int $draftitemid) {
        $p = self::validate_parameters(self::set_course_image_parameters(), compact('courseid', 'draftitemid'));
        [$course, $ctx] = self::course_ctx($p['courseid'], 'moodle/course:update');
        file_save_draft_area_files($p['draftitemid'], $ctx->id, 'course', 'overviewfiles', 0,
            ['subdirs' => 0, 'maxfiles' => 1, 'accepted_types' => ['web_image']]);
        return self::json_out(['ok' => true]);
    }

    public static function set_course_image_returns() {
        return new external_value(PARAM_RAW, 'JSON');
    }

    // ---------------------------------------------------------------- single sign-on

    public static function create_login_url_parameters() {
        return new external_function_parameters([
            'userid' => new external_value(PARAM_INT, 'Moodle user id'),
            'path' => new external_value(PARAM_RAW, 'Path inside Moodle to open after sign-in, e.g. /course/view.php?id=3', VALUE_DEFAULT, '/my/'),
        ]);
    }

    public static function create_login_url(int $userid, string $path = '/my/') {
        global $CFG;
        $p = self::validate_parameters(self::create_login_url_parameters(), compact('userid', 'path'));
        \context_system::instance();
        $user = \core_user::get_user($p['userid'], '*', MUST_EXIST);
        // Never mint a sign-in for a site administrator or an inactive account.
        if (is_siteadmin($user) || $user->deleted || $user->suspended || $user->auth === 'nologin') {
            throw new moodle_exception('nopermissions', 'error', '', 'single sign-on for this account');
        }
        $path = $p['path'];
        if ($path === '' || $path[0] !== '/' || strpos($path, '//') === 0 || strpos($path, '\\') !== false) {
            $path = '/my/';
        }
        $key = create_user_key('local_meyveda_sso', $user->id, null, null, time() + 60);
        return self::json_out(['url' => $CFG->wwwroot . '/local/meyveda/sso.php?key=' . $key . '&path=' . rawurlencode($path)]);
    }

    public static function create_login_url_returns() {
        return new external_value(PARAM_RAW, 'JSON');
    }
}
