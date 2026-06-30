document.addEventListener('DOMContentLoaded', () => {

    /* Scroll progress bar */
    const bar = document.querySelector('.progress span');
    const updateBar = () => {
        const h = document.documentElement;
        const max = h.scrollHeight - h.clientHeight;
        const pct = max > 0 ? (h.scrollTop / max) * 100 : 0;
        if (bar) bar.style.width = pct + '%';
    };
    updateBar();
    window.addEventListener('scroll', updateBar, { passive: true });
    window.addEventListener('resize', updateBar);

    /* Smooth-scroll nav (custom so we can offset the sticky header) */
    document.querySelectorAll('.site-nav a[href^="#"]').forEach((link) => {
        link.addEventListener('click', (e) => {
            const id = link.getAttribute('href').slice(1);
            const target = document.getElementById(id);
            if (!target) return;
            e.preventDefault();
            const offset = document.querySelector('.site-header')?.offsetHeight || 0;
            const top = target.getBoundingClientRect().top + window.scrollY - offset - 16;
            window.scrollTo({ top, behavior: 'smooth' });
        });
    });

    /* IntersectionObserver — reveal on scroll */
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
        document.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'));
        return;
    }

    const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('in');
                io.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.12,
        rootMargin: '0px 0px -8% 0px',
    });

    document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
});
