// ===== Enhanced Service Worker Registration with Auto-Update =====
let newWorker = null;
let refreshing = false;

// Prevent infinite refresh loop
navigator.serviceWorker.addEventListener("controllerchange", () => {
  if (!refreshing) {
    refreshing = true;
    window.location.reload();
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("service-worker.js")
    .then((reg) => {
      // Check for updates every time the app loads
      reg.update();
      
      // Check for updates every 60 seconds when app is open
      setInterval(() => {
        reg.update();
      }, 60000);
      
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        if (!sw) return;
        
        sw.addEventListener("statechange", () => {
          if (sw.state === "installed" && navigator.serviceWorker.controller) {
            // New version ready
            newWorker = sw;
            if (updateAppBtn) {
              updateAppBtn.classList.remove("hidden");
            }
            
            // Optional: Auto-update after 3 seconds
            // setTimeout(() => {
            //   if (newWorker) {
            //     newWorker.postMessage({ type: "SKIP_WAITING" });
            //   }
            // }, 3000);
          }
        });
      });
    })
    .catch(console.error);
}

if (updateAppBtn) {
  updateAppBtn.addEventListener("click", () => {
    if (newWorker) {
      newWorker.postMessage({ type: "SKIP_WAITING" });
    } else {
      window.location.reload();
    }
  });
}