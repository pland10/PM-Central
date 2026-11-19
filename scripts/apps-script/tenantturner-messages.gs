/**
 * Tenant Turner lead replies -> PM Central.
 *
 * Runs inside the shared Gmail (paul@pmilighthouse.com) as a Google Apps Script
 * (script.google.com). Every 5 minutes it finds Tenant Turner's
 * "New message from <lead>" notification emails from the last 3 days and posts
 * them to PM Central, which stores each one once (by Gmail message id) and
 * shows it on the Showings page next to the lead.
 *
 * Setup (one time):
 *   1. script.google.com -> New project -> paste this file -> Save.
 *   2. Project Settings -> Script properties -> add TT_MESSAGES_SECRET with the
 *      same value as TT_MESSAGES_SECRET in Vercel (Production).
 *   3. Run `install` once (approve the Gmail + external request permissions).
 *      That runs a first sync and schedules `syncTenantTurnerMessages` every 5 min.
 */

var ENDPOINT = 'https://pmilighthouse.app/api/webhooks/tenantturner-messages';
var QUERY = 'from:email@ttusermail.com subject:"New message from" newer_than:3d';
var BATCH = 50;

function syncTenantTurnerMessages() {
  var secret = PropertiesService.getScriptProperties().getProperty('TT_MESSAGES_SECRET');
  if (!secret) throw new Error('Set the TT_MESSAGES_SECRET script property first.');

  var messages = [];
  GmailApp.search(QUERY, 0, 100).forEach(function (thread) {
    thread.getMessages().forEach(function (m) {
      if (m.getFrom().indexOf('ttusermail.com') === -1) return;
      messages.push({
        id: m.getId(),
        date: m.getDate().toISOString(),
        subject: m.getSubject(),
        body: m.getPlainBody(),
      });
    });
  });

  for (var i = 0; i < messages.length; i += BATCH) {
    var res = UrlFetchApp.fetch(ENDPOINT, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + secret },
      payload: JSON.stringify({ messages: messages.slice(i, i + BATCH) }),
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() !== 200) {
      throw new Error('PM Central returned HTTP ' + res.getResponseCode());
    }
  }
  Logger.log('Sent ' + messages.length + ' Tenant Turner email(s) to PM Central.');
}

// Run once: first sync, then every 5 minutes.
function install() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncTenantTurnerMessages') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncTenantTurnerMessages').timeBased().everyMinutes(5).create();
  syncTenantTurnerMessages();
}
