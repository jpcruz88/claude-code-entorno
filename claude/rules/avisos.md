## Avisos de fin de turno: solo cuando de verdad terminaste

Herdr (y cualquier aviso de «Claude terminó») salta en cuanto tu turno acaba. Si
cierras el turno con trabajo tuyo pendiente («te aviso cuando termine»), el usuario
recibe un aviso de «terminado» que es falso y lo confunde.

- Si vas a esperar algo que lanzaste (instalador, CI, pruebas largas, un build),
  espéralo en primer plano: `Bash` con `timeout` de hasta 600000 ms, o un bucle con
  `Monitor` hasta que acabe. No cierres el turno diciendo «te aviso».
- Si de verdad tarda más de 10 min, encadena esperas en primer plano en el mismo
  turno hasta que termine.
- Solo cierra el turno cuando terminaste o cuando necesitas una respuesta del
  usuario. Así cada aviso significa una de esas dos cosas.
