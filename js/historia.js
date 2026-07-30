/*=====================================
HISTORIA
=====================================*/

document.addEventListener("DOMContentLoaded", () => {

    const sections = document.querySelectorAll(".reveal");

    const observer = new IntersectionObserver((entries) => {

        entries.forEach(entry => {

            if (entry.isIntersecting){

                entry.target.classList.add("active");

                observer.unobserve(entry.target);

            }

        });

    },{

        threshold:0.15

    });

    sections.forEach(section=>{

        observer.observe(section);

    });

});
/*=====================================
SLIDER CAPÍTULO II
=====================================*/

const slides = document.querySelectorAll(".chapter-image .slide");

if(slides.length){

    let current = 0;

    setInterval(()=>{

        slides[current].classList.remove("active");

        current++;

        if(current >= slides.length){

            current = 0;

        }

        slides[current].classList.add("active");

    },5000);

}