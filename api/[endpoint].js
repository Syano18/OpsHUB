import activitiesHandler from '../server/controllers/activities.js';
import authHandler from '../server/controllers/auth.js';
import calendarHandler from '../server/controllers/calendar.js';
import cronHandler from '../server/controllers/cron.js';
import dtrHandler from '../server/controllers/dtr.js';
import employmentsHandler from '../server/controllers/employments.js';
import leaveHandler from '../server/controllers/leave.js';
import logbookHandler from '../server/controllers/logbook.js';
import notifyTransmitHandler from '../server/controllers/notify-transmit.js';
import pushSubscribeHandler from '../server/controllers/push-subscribe.js';
import sendEmailHandler from '../server/controllers/send-email.js';
import usersHandler from '../server/controllers/users.js';

export default async function handler(req, res) {
  const { endpoint } = req.query;

  switch (endpoint) {
    case 'activities':
      return activitiesHandler(req, res);
    case 'auth':
      return authHandler(req, res);
    case 'calendar':
      return calendarHandler(req, res);
    case 'cron':
      return cronHandler(req, res);
    case 'dtr':
      return dtrHandler(req, res);
    case 'employments':
      return employmentsHandler(req, res);
    case 'leave':
      return leaveHandler(req, res);
    case 'logbook':
      return logbookHandler(req, res);
    case 'notify-transmit':
      return notifyTransmitHandler(req, res);
    case 'push-subscribe':
      return pushSubscribeHandler(req, res);
    case 'send-email':
      return sendEmailHandler(req, res);
    case 'users':
      return usersHandler(req, res);
    default:
      return res.status(404).json({ error: `API endpoint '${endpoint}' not found` });
  }
}
