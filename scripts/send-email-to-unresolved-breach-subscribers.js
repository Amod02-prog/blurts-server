const DB = require('../db/DB')
const EmailUtils = require('../email-utils')
const { LocaleUtils } = require('../locale-utils')
const AppConstants = require('../app-constants')
const { argv } = require('node:process')

async function sendUnresolvedBreachEmails (subscribers = null) {
  let count = 0

  LocaleUtils.init()
  await EmailUtils.init()
  await DB.createConnection()

  if (!subscribers) subscribers = await DB.getSubscribersWithUnresolvedBreaches() // if test subscribers are not available, pull from db

  console.log('- Recipient total:', subscribers.length)

  for (const subscriber of subscribers) {
    try {
      const supportedLocales = [subscriber.signup_language, 'en'].filter(Boolean) // filter potential nullish signup_language, fallback to en
      const subject = LocaleUtils.fluentFormat(supportedLocales, 'email-unresolved-heading')
      const unsubscribeUrl = EmailUtils.getMonthlyUnsubscribeUrl(subscriber, 'monthly-unresolved', 'unsubscribe-cta')

      await EmailUtils.sendEmail(subscriber.primary_email, subject, 'email-2022',
        {
          whichPartial: 'email_partials/email-monthly-unresolved',
          supportedLocales,
          primaryEmail: subscriber.primary_email,
          breachStats: subscriber.breach_stats,
          unsubscribeUrl
        }
      )
      count++
      await DB.updateMonthlyEmailTimestamp(subscriber.primary_email)
    } catch (e) {
      console.warn(e)
      continue
    }
  }

  await DB.destroyConnection()
  console.log(`- Successfully emailed ${count} of ${subscribers.length} subscribers`)
}

if (argv[2]) {
  // For testing, pass a comma-separated arg with no spaces, for example:
  // node scripts/send-email-to-unresolved-breach-subscribers.js test1@test.com,test2@test.com,...
  const subscribers = []
  const emails = argv[2].split(',')

  console.log('Testing job for monthly unresolved breach emails...')
  console.log('- sending test emails to', emails)

  emails.forEach(email => {
    subscribers.push({
      primary_email: email,
      signup_language: 'en',
      primary_verification_token: 'dev-token-for-testing',
      breach_stats: {
        passwords: {
          count: 1,
          numResolved: 0
        },
        numBreaches: {
          count: 2,
          numResolved: 0,
          numUnresolved: 2
        },
        monitoredEmails: {
          count: 2
        }
      }
    })
  })
  sendUnresolvedBreachEmails(subscribers)
} else if (AppConstants.MONTHLY_CRON_ENABLED === 'true') {
  console.log('Running job for monthly unresolved breach emails...')
  sendUnresolvedBreachEmails()
} else {
  console.log('Job for monthly unresolved breach emails was not run. MONTHLY_CRON_ENABLED expects the string "true".')
}
