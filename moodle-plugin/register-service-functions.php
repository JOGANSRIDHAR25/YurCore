<?php
/**
 * One-time setup, run from the Moodle root after installing local/meyveda:
 *   php local/meyveda/../../path/to/register-service-functions.php   (or copy it there)
 * Adds the bridge + required core functions to the 'ayurllm' external service and enables
 * file upload/download for that service (needed for course images, PDFs and videos).
 */
define('CLI_SCRIPT', true);
require(getcwd() . '/config.php');
require_once($CFG->dirroot.'/webservice/lib.php');
$svc = $DB->get_record('external_services', ['shortname' => 'ayurllm'], '*', MUST_EXIST);
$wm = new webservice();
$want = ['gradereport_user_get_grade_items','core_completion_get_activities_completion_status','core_course_get_courses_by_field','core_course_update_courses','core_course_create_courses','core_enrol_get_enrolled_users','enrol_manual_unenrol_users','enrol_manual_enrol_users','core_course_get_contents'];
$fns = $DB->get_fieldset_select('external_functions', 'name', "name LIKE 'local_meyveda_%'");
foreach (array_merge($want, $fns) as $f) {
    if (!$DB->record_exists('external_functions', ['name'=>$f])) { echo "NOFUNC $f\n"; continue; }
    if (!$wm->service_function_exists($f, $svc->id)) { $wm->add_external_function_to_service($f, $svc->id); echo "added $f\n"; }
}
echo "service functions: ".$DB->count_records('external_services_functions',['externalserviceid'=>$svc->id])."\n";
$DB->set_field('external_services', 'uploadfiles', 1, ['id' => $svc->id]);
$DB->set_field('external_services', 'downloadfiles', 1, ['id' => $svc->id]);
echo "file upload/download enabled\n";
