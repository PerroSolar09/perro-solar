//==================================================
// MENÚ HAMBURGUESA
//==================================================

const menuToggle = document.querySelector(".menu-toggle");
const nav = document.querySelector("nav");

if (menuToggle && nav) {

    menuToggle.addEventListener("click", () => {

        nav.classList.toggle("active");

    });

    // Cerrar menú al seleccionar una opción
    nav.querySelectorAll("a").forEach((link) => {

        link.addEventListener("click", () => {

            nav.classList.remove("active");

        });

    });

}


//==================================================
// FORMULARIO DE CONTACTO
//==================================================

const formulario = document.querySelector(".contact-form form");

if (formulario) {

    formulario.addEventListener("submit", async function (e) {

        e.preventDefault();

        const boton = formulario.querySelector(".btn-contacto");

        const datos = new URLSearchParams();

        datos.append("nombre", document.getElementById("nombre").value);
        datos.append("correo", document.getElementById("correo").value);
        datos.append("asunto", document.getElementById("asunto").value);
        datos.append("mensaje", document.getElementById("mensaje").value);

        boton.disabled = true;
        boton.textContent = "Enviando...";

        try {

            await fetch(
                "https://script.google.com/macros/s/AKfycby2rQPvmwGuQ8yVTvwgmffvyJYh8VIhCMwkAeUewVG0JfnwVLvpZG1XbYMbhiRnUhSC/exec",
                {
                    method: "POST",
                    body: datos
                }
            );

            formulario.reset();

            boton.textContent = "Mensaje enviado ✓";

            setTimeout(() => {

                boton.disabled = false;
                boton.textContent = "Enviar mensaje →";

            }, 4000);

        } catch (error) {

            console.error(error);

            boton.disabled = false;
            boton.textContent = "Error al enviar";

            setTimeout(() => {

                boton.textContent = "Enviar mensaje →";

            }, 4000);

        }

    });

}