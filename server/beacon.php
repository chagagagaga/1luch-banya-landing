<?php
/* Маячок ухода в мессенджер: пересылаем в cd-lead с сервера, клиенту сразу 204. */
http_response_code(204);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') exit;
$ch = curl_init('https://cd-lead.chagagagaga.workers.dev/beacon');
curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => http_build_query($_POST),
    CURLOPT_HTTPHEADER => ['Origin: https://' . $_SERVER['HTTP_HOST']], CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 6]);
curl_exec($ch); curl_close($ch);
