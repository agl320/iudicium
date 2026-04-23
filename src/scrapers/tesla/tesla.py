import time
from playwright.sync_api import sync_playwright

URL = "https://www.tesla.com/cua-api/apps/careers/state"
INTERVAL = 300

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp("http://localhost:9222")
    context = browser.contexts[0]

    page = context.pages[0] if context.pages else context.new_page()

    # initial navigation only once
    page.goto(URL, wait_until="domcontentloaded")
    page.wait_for_timeout(3000)

    while True:
        # Refresh the page to trigger the API call and get the latest data
        page.reload(wait_until="domcontentloaded")
        page.wait_for_timeout(3000)

        # TODO: Fix
        data = page.content()
        print("Response size:", len(data))
        print("Response preview:", data[:500])

        time.sleep(INTERVAL)
