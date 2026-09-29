<?php
/* Первый Луч — приёмник заявок на российском хостинге (1luch.ru, REG.RU).
 * Браузер шлёт заявку сюда, на свой домен: никаких зарубежных адресов
 * в пути клиента из России. Дальше сервер пересылает её в общий обработчик
 * cd-lead (Telegram-группа Луча + ЛСО + Google-таблица). Если он не ответил,
 * заявка уходит в ЛСО напрямую и пишется в резервный лог — не теряется. */
header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo '{"ok":false}'; exit; }
$raw = file_get_contents('php://input');
$lead = json_decode($raw, true);
if (!is_array($lead) || empty($lead['phone'])) { http_response_code(400); echo '{"ok":false,"error":"bad_request"}'; exit; }
if (!empty($lead['website'])) { echo '{"ok":true}'; exit; }          // ловушка для ботов

function post($url, $body, $type, $timeout = 8) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body,
        CURLOPT_HTTPHEADER => ['Content-Type: ' . $type, 'Origin: https://' . $_SERVER['HTTP_HOST']],
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 5]);
    $res = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return [$code, $res];
}

list($code, $res) = post('https://cd-lead.chagagagaga.workers.dev/lead', $raw, 'application/json');
$ok = $code >= 200 && $code < 300;
$via = 'worker';
if (!$ok) {
    $lso = $lead; $lso['site_key'] = strtolower(preg_replace('/[^a-z0-9]+/i', '_', preg_replace('/^www\./', '', $_SERVER['HTTP_HOST']))); $lso['landing'] = $lead['site_key'] ?? 'luch-banya';
    list($c2, $r2) = post('https://ceramicadecor.ru/feedback/external_lead', json_encode($lso, JSON_UNESCAPED_UNICODE), 'application/json');
    $via = 'lso_direct:' . $c2;
    $ok = $c2 >= 200 && $c2 < 300;
}
@file_put_contents(__DIR__ . '/../leads_backup/' . date('Y-m') . '.jsonl',
    json_encode(['t' => date('c'), 'via' => $via, 'worker_http' => $code, 'lead' => $lead], JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND | LOCK_EX);
echo json_encode(['ok' => true, 'via' => $via]);
