// Minimalist fallback for smooth, chilled animations on older browsers
if (!CSS.supports('(animation-timeline: view()) and (animation-range: entry)')) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.transition = 'opacity 0.8s ease-out, transform 0.8s ease-out';
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.scroll-reveal').forEach(el => {
    // Initial state
    el.style.opacity = '0';
    el.style.transform = 'translateY(40px)';
    observer.observe(el);
  });
}

// Make entire project cards clickable
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.project-card').forEach(card => {
    const link = card.querySelector('a.btn-outline');
    if (link) {
      card.style.cursor = 'pointer';
      // Apply subtle hover effect to the whole card
      card.addEventListener('mouseenter', () => {
        card.style.transform = 'translateY(-2px)';
        card.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
        card.style.transition = 'all 0.3s ease';
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
        card.style.boxShadow = '';
      });
      
      card.addEventListener('click', (e) => {
        if (!e.target.closest('a')) {
          link.click();
        }
      });
    }
  });
});
