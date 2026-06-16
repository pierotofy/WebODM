function showToasterRipple(sourceElement) {
    if (!sourceElement) return;

    const sourceRect = sourceElement.getBoundingClientRect();

    const getToasterEl = () => {
        return document.querySelector('.global-toaster');
    };

    let toasterEl = getToasterEl();
    let attempts = 0;
    const maxAttempts = 50;

    const waitForToaster = () => {
        toasterEl = getToasterEl();
        if (toasterEl) {
            showToasterRippleAnimation(sourceRect, toasterEl);
        } else if (attempts < maxAttempts) {
            attempts++;
            setTimeout(waitForToaster, 50);
        }
    };

    waitForToaster();
}

function showToasterRippleAnimation(sourceRect, toasterEl) {
    const overlay = document.createElement('div');
    overlay.className = 'toaster-ripple-overlay theme-border-primary';
    overlay.style.left = sourceRect.left + 'px';
    overlay.style.top = sourceRect.top + 'px';
    overlay.style.width = sourceRect.width + 'px';
    overlay.style.height = sourceRect.height + 'px';
    overlay.style.opacity = '1';
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
        const toasterRect = toasterEl.getBoundingClientRect();
        overlay.style.transition = 'left 0.667s ease-in-out, top 0.667s ease-in-out, width 0.667s ease-in-out, height 0.667s ease-in-out';
        overlay.style.left = toasterRect.left + 'px';
        overlay.style.top = toasterRect.top + 'px';
        overlay.style.width = toasterRect.width + 'px';
        overlay.style.height = toasterRect.height + 'px';
    });

    overlay.addEventListener('transitionend', () => {
        let blinkCount = 0;
        const blinkDuration = 66;
        const maxBlinks = 3;

        const blink = () => {
            if (blinkCount >= maxBlinks) {
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
                return;
            }

            overlay.style.opacity = blinkCount % 2 === 0 ? '0' : '1';
            blinkCount++;

            setTimeout(blink, blinkDuration);
        };

        setTimeout(blink, 50);
    }, { once: true });

      setTimeout(() => {
        if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
    }, 1500);
}


module.exports = {
    showToasterRipple
}
