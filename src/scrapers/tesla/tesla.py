import time
from playwright.sync_api import sync_playwright

URL = "https://www.tesla.com/cua-api/apps/careers/state"

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp("http://localhost:9222")
    context = browser.contexts[0]

    page = context.pages[0] if context.pages else context.new_page()

    while True:
        print("Navigating...")

        page.goto(URL, wait_until="domcontentloaded")
        page.wait_for_timeout(3000)

        data = page.content()
        print(len(data))

        time.sleep(300)  # 5 min
