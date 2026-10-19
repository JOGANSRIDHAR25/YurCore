<?php
// One-time sign-in for learners launched from YurCore. The key is minted server-side by
// local_meyveda_create_login_url (requires the web-service token), is valid for 60 seconds and single use.
define('NO_MOODLE_COOKIES', false);
require_once(__DIR__ . '/../../config.php');

$keyvalue = required_param('key', PARAM_ALPHANUM);
$path = optional_param('path', '/my/', PARAM_RAW);

$key = $DB->get_record('user_private_key', ['script' => 'local_meyveda_sso', 'value' => $keyvalue]);
if (!$key || ($key->validuntil && $key->validuntil < time())) {
    if ($key) {
        $DB->delete_records('user_private_key', ['id' => $key->id]);
    }
    throw new moodle_exception('invalidkey', 'error');
}
$DB->delete_records('user_private_key', ['id' => $key->id]); // Single use.

$user = get_complete_user_data('id', $key->userid);
if (!$user || $user->deleted || $user->suspended || is_siteadmin($user)) {
    throw new moodle_exception('invaliduser', 'error');
}
complete_user_login($user);
\core\session\manager::apply_concurrent_login_limit($user->id, session_id());

if ($path === '' || $path[0] !== '/' || strpos($path, '//') === 0 || strpos($path, '\\') !== false) {
    $path = '/my/';
}
redirect(new moodle_url($path));
