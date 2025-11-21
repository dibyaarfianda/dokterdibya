/* HTML document is loaded. DOM is ready.
-------------------------------------------*/
$(function(){

    /* start typed element */
    //http://stackoverflow.com/questions/24874797/select-div-title-text-and-make-array-with-jquery
    var subElementArray = $.map($('.sub-element'), function(el) { return $(el).text(); });    
    $(".element").typed({
        strings: subElementArray,
        typeSpeed: 30,
        contentType: 'html',
        showCursor: false,
        loop: true,
        loopCount: true,
    });
    /* end typed element */

    /* Smooth scroll and Scroll spy (https://github.com/ChrisWojcik/single-page-nav)
    ---------------------------------------------------------------------------------*/
    console.log('🔧 Initializing singlePageNav with filter:', ':not(.external):not([href*=".html"])');
    var navLinks = $('.templatemo-nav a');
    console.log('📊 Total nav links:', navLinks.length);
    console.log('📊 Nav links:', navLinks.map(function() { return this.href; }).get());

    $('.templatemo-nav').singlePageNav({
        offset: $(".templatemo-nav").height(),
        filter: ':not(.external):not([href*=".html"])',
        updateHash: false
    });

    var filteredLinks = $('.templatemo-nav a:not(.external):not([href*=".html"])');
    console.log('✅ singlePageNav initialized, filtered links:', filteredLinks.length);
    console.log('📊 Filtered links:', filteredLinks.map(function() { return this.href; }).get());

    /* start navigation top js */
    $(window).scroll(function(){
        if($(this).scrollTop()>58){
            $(".templatemo-nav").addClass("sticky");
        }
        else{
            $(".templatemo-nav").removeClass("sticky");
        }
    });
    
    /* Hide mobile menu after clicking on a link
    -----------------------------------------------*/
    $('.navbar-collapse a:not(.external)').click(function(){
        $(".navbar-collapse").collapse('hide');
    });
    /* end navigation top js */

    $('body').bind('touchstart', function() {});

    /* wow
    -----------------*/
    new WOW().init();
});

/* start preloader */
$(window).load(function(){
	$('.preloader').fadeOut(1000); // set duration in brackets    
});
/* end preloader */
