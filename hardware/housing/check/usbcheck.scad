include <checks.scad>
check2="";
if (check2=="cap_body") intersection(){ usbcap(); body(); }
if (check2=="cap_atom") intersection(){ usbcap(); atom(); }
if (check2=="cap_brow") intersection(){ usbcap(); brow(); }
