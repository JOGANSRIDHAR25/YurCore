<?php
defined('MOODLE_INTERNAL') || die();

$fn = function (string $name, string $desc, string $type = 'write', string $caps = 'moodle/course:manageactivities'): array {
    return [
        'classname'   => 'local_meyveda\external\api',
        'methodname'  => $name,
        'description' => $desc,
        'type'        => $type,
        'ajax'        => false,
        'capabilities' => $caps,
    ];
};

$functions = [
    'local_meyveda_get_course_structure' => $fn('get_course_structure', 'Sections and activities of a course, with settings.', 'read'),
    'local_meyveda_get_addable_modules'  => $fn('get_addable_modules', 'Modules offered under Add an activity or resource.', 'read'),
    'local_meyveda_get_activity_form'    => $fn('get_activity_form', 'The installed Moodle settings form of an activity, with values.', 'read'),
    'local_meyveda_save_activity'        => $fn('save_activity', 'Validate and save an activity through its Moodle form.'),
    'local_meyveda_set_activity_visibility' => $fn('set_activity_visibility', 'Show or hide an activity.', 'write', 'moodle/course:activityvisibility'),
    'local_meyveda_get_quiz'             => $fn('get_quiz', 'Questions and grade of a quiz.', 'read'),
    'local_meyveda_get_question_bank'    => $fn('get_question_bank', 'Question bank questions available to a quiz.', 'read'),
    'local_meyveda_add_bank_question'    => $fn('add_bank_question', 'Add a question bank question to a quiz.'),
    'local_meyveda_delete_activity'      => $fn('delete_activity', 'Delete an activity.'),
    'local_meyveda_move_activity'        => $fn('move_activity', 'Move an activity to a section/position.'),
    'local_meyveda_add_section'          => $fn('add_section', 'Add a section.', 'write', 'moodle/course:update'),
    'local_meyveda_update_section'       => $fn('update_section', 'Rename/describe a section.', 'write', 'moodle/course:update'),
    'local_meyveda_delete_section'       => $fn('delete_section', 'Delete a section.', 'write', 'moodle/course:update'),
    'local_meyveda_move_section'         => $fn('move_section', 'Reorder a section.', 'write', 'moodle/course:update'),
    'local_meyveda_add_quiz_question'    => $fn('add_quiz_question', 'Add a question to a quiz.'),
    'local_meyveda_update_quiz_question' => $fn('update_quiz_question', 'Edit a quiz question.'),
    'local_meyveda_delete_quiz_question' => $fn('delete_quiz_question', 'Remove a question from a quiz.'),
    'local_meyveda_set_course_image'     => $fn('set_course_image', 'Set the course overview image from a draft file.', 'write', 'moodle/course:update'),
    'local_meyveda_create_login_url'     => $fn('create_login_url', 'One-time sign-in URL for a learner.', 'write', 'moodle/user:update'),
];
