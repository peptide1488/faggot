window.onload = function() {
	var notesBtn = document.getElementById("notes-btn");
	if (notesBtn) {
		notesBtn.onclick = function(){  
			document.body.classList.toggle("notes-show");
			document.body.classList.toggle("notes-hide");
		};
	}
};