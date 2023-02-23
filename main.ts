import { execSync } from 'child_process'
import lodash from 'lodash'
import { chromium } from 'playwright'

const userAgent =
  'User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 16_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/20C65 iOS16.2 (iPhone11,8;zh-Hans-CN) App/4.1.0 AliApp(yunpan/4.1.0) com.alicloud.smartdrive/28062254  Channel/201200 AliApp(AYSD/4.1.0) com.alicloud.smartdrive/4.1.0 Version/16.2 Channel/201200 Language/zh-Hans-CN /iOS Mobile/iPhone11,8 language/zh-Hans-CN'

async function main() {
  // 刷新 token
  const refreshTokenResponse = await fetch(
    'https://api.aliyundrive.com/token/refresh',
    {
      method: 'POST',
      body: JSON.stringify({
        refresh_token: process.env.ALIYUNDRIVE_REFRESH_TOKEN,
      }),
      headers: {
        'content-type': 'application/json',
      },
    },
  )
  if (!refreshTokenResponse.ok) {
    let respBody = await refreshTokenResponse.text()
    throw new Error(`刷新token失败: ${respBody}`)
  }

  const { refresh_token, access_token } = await refreshTokenResponse.json()
  process.env.ALIYUNDRIVE_REFRESH_TOKEN = refresh_token

  // 更新 github action secret ALIYUNDRIVE_REFRESH_TOKEN
  execSync(
    'gh secret set ALIYUNDRIVE_REFRESH_TOKEN --body "${ALIYUNDRIVE_REFRESH_TOKEN}"',
  )

  const browser = await chromium.launch()
  const page = await browser.newPage({
    // 模拟移动端访问
    userAgent,
  })

  // 所有请求附带 access_token
  page.route('**/*', (route, request) => {
    const headers = request.headers()
    if (request.method() === 'POST') {
      headers['Authorization'] = `Bearer ${access_token}`
    }

    route.continue({ headers })
  })

  // 签到
  await page.goto(
    'https://pages.aliyundrive.com/mobile-page/web/dailycheck.html?disableNav=YES&adtag=push_dailySignRemind',
    {
      waitUntil: 'domcontentloaded',
    },
  )

  let signInListResp = null
  page.on('response', async function (response) {
    let url = response.url()
    if (lodash.includes(url, 'activity/sign_in_list')) {
      signInListResp = await response.json()
    }
  })

  // 领取奖励
  await page.locator('span', { hasText: '立即' }).click()
  if (signInListResp) {
    const { result } = signInListResp
    const signInLog = lodash.findLast(result.signInLogs, (signInLog) => {
      return !!signInLog.reward?.name
    })

    const { reward } = signInLog
    console.log(`签到完成，获得奖励: ${reward.name} ${reward.description}`)
    return
  }

  // 结束
  console.log('签到完成')
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch((err) => {
    console.log(`签到失败: ${err}`)
    process.exit(-1)
  })
