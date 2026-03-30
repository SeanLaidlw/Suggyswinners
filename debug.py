from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    context = browser.new_context(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    page = context.new_page()
    page.goto("https://loveracing.nz/RaceInfo.aspx", wait_until="domcontentloaded", timeout=30000)
    input("Look for a Results or Past Meetings section, navigate to it, then press Enter...")
    
    print("URL:", page.url)
    links = page.query_selector_all("a[href*='Meeting-Overview']")
    print(f"Found {len(links)} meeting links:")
    for link in links[:20]:
        print(" ", link.get_attribute("href"), "|", link.inner_text().strip())
    
    browser.close()