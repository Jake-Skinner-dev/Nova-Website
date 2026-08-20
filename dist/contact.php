<?php
/**
 * Nova Social — contact form handler.
 *
 * Plain PHP mail() so it runs on standard 123 Reg cPanel hosting with no
 * extra dependencies and no credentials stored in the codebase. Update
 * RECIPIENT_EMAIL below once the real inbox is confirmed.
 */

declare(strict_types=1);

// ---------------------------------------------------------------------
// Configuration — update this before going live.
// ---------------------------------------------------------------------
const RECIPIENT_EMAIL = 'jake@novasocial.co.uk';
const SITE_NAME = 'Nova Social';

header('Content-Type: application/json; charset=utf-8');

// Only allow requests from this site (basic origin check, not a security
// boundary on its own — combined with the honeypot + validation below).
$allowedHost = $_SERVER['HTTP_HOST'] ?? '';
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

function field(string $key): string {
    return trim((string) filter_input(INPUT_POST, $key, FILTER_UNSAFE_RAW) ?: '');
}

function cleanForHeader(string $value): string {
    // Strip CR/LF to prevent header injection when a field is echoed into
    // the "Reply-To" / "From" headers below.
    return trim(preg_replace('/[\r\n]+/', ' ', $value));
}

$name = cleanForHeader(field('name'));
$email = cleanForHeader(field('email'));
$business = cleanForHeader(field('business'));
$need = cleanForHeader(field('need'));
$message = field('message');
$honeypot = field('website'); // must stay empty — real visitors never see this field

if ($honeypot !== '') {
    // Pretend success so bots don't learn the honeypot was tripped.
    echo json_encode(['success' => true]);
    exit;
}

if ($name === '' || $email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(422);
    echo json_encode(['success' => false, 'error' => 'Please provide a valid name and email address.']);
    exit;
}

if (mb_strlen($name) > 200 || mb_strlen($business) > 200 || mb_strlen($message) > 5000) {
    http_response_code(422);
    echo json_encode(['success' => false, 'error' => 'One of the fields is too long.']);
    exit;
}

$subject = SITE_NAME . ' — New enquiry from ' . $name;

$bodyLines = [
    'New enquiry from the Nova Social website contact form.',
    '',
    'Name: ' . $name,
    'Email: ' . $email,
    'Business: ' . ($business !== '' ? $business : '—'),
    'What they need: ' . ($need !== '' ? $need : '—'),
    '',
    'Message:',
    $message !== '' ? $message : '(no message provided)',
];
$body = implode("\n", $bodyLines);

// Use a same-domain From address (most cPanel mail setups reject or flag
// a From: header using an external domain) and put the visitor's address
// in Reply-To so replying goes straight to them.
$fromDomain = $allowedHost !== '' ? preg_replace('/^www\./', '', $allowedHost) : 'localhost';
$headers = [
    'From: ' . SITE_NAME . ' Website <no-reply@' . $fromDomain . '>',
    'Reply-To: ' . $name . ' <' . $email . '>',
    'Content-Type: text/plain; charset=UTF-8',
];

$sent = @mail(RECIPIENT_EMAIL, $subject, $body, implode("\r\n", $headers));

if (!$sent) {
    http_response_code(502);
    echo json_encode(['success' => false, 'error' => 'The message could not be sent. Please try again shortly.']);
    exit;
}

echo json_encode(['success' => true]);
