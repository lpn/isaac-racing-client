/*
    Lobby screen
*/

'use strict';

// Imports
const shell      = nodeRequire('electron').shell;
const globals    = nodeRequire('./assets/js/globals');
const misc       = nodeRequire('./assets/js/misc');
const chat       = nodeRequire('./assets/js/chat');
const logWatcher = nodeRequire('./assets/js/log-watcher');
const isaac      = nodeRequire('./assets/js/isaac');
const modLoader  = nodeRequire('./assets/js/mod-loader');
const header     = nodeRequire('./assets/js/ui/header');

/*
    Event handlers
*/

$(document).ready(function() {
    $('#lobby-chat-form').submit(function(event) {
        // By default, the form will reload the page, so stop this from happening
        event.preventDefault();

        // Validate input and send the chat
        chat.send('lobby');
    });
});

/*
    Lobby functions
*/

// Called from the login screen or the register screen
exports.show = function() {
    // Start the log watcher
    if (logWatcher.start() === -1) {
        return;
    }

    // Launch Isaac
    isaac.start();

    // Make sure that all of the forms are cleared out
    $('#login-username').val('');
    $('#login-password').val('');
    $('#login-remember-checkbox').prop('checked', false);
    $('#login-error').fadeOut(0);
    $('#register-username').val('');
    $('#register-password').val('');
    $('#register-email').val('');
    $('#register-error').fadeOut(0);

    // Show the links in the header
    $('#header-profile').fadeIn(globals.fadeTime);
    $('#header-leaderboards').fadeIn(globals.fadeTime);
    $('#header-help').fadeIn(globals.fadeTime);

    // Show the buttons in the header
    $('#header-new-race').fadeIn(globals.fadeTime);
    $('#header-settings').fadeIn(globals.fadeTime);

    // Show the lobby
    $('#page-wrapper').removeClass('vertical-center');
    $('#lobby').fadeIn(globals.fadeTime, function() {
        globals.currentScreen = 'lobby';
    });

    // Fix the indentation on lines that were drawn when the element was hidden
    chat.indentAll('lobby');

    // Automatically scroll to the bottom of the chat box
    let bottomPixel = $('#lobby-chat-text').prop('scrollHeight') - $('#lobby-chat-text').height();
    $('#lobby-chat-text').scrollTop(bottomPixel);

    // Focus the chat input
    $('#lobby-chat-box-input').focus();
};

exports.showFromRace = function() {
    // We should be on the race screen unless there is severe lag
    if (globals.currentScreen !== 'race') {
        misc.errorShow('Failed to return to the lobby since currentScreen is equal to "' + globals.currentScreen + '".');
        return;
    }
    globals.currentScreen = 'transition';
    globals.currentRaceID = false;

    // Show and hide some buttons in the header
    $('#header-profile').fadeOut(globals.fadeTime);
    $('#header-leaderboards').fadeOut(globals.fadeTime);
    $('#header-help').fadeOut(globals.fadeTime);
    $('#header-lobby').fadeOut(globals.fadeTime, function() {
        $('#header-profile').fadeIn(globals.fadeTime);
        $('#header-leaderboards').fadeIn(globals.fadeTime);
        $('#header-help').fadeIn(globals.fadeTime);
        $('#header-new-race').fadeIn(globals.fadeTime);
        $('#header-settings').fadeIn(globals.fadeTime);
        header.checkHideLinks(); // We just faded in the links, but they might be hidden on small windows
    });

    // Show the lobby
    $('#race').fadeOut(globals.fadeTime, function() {
        $('#lobby').fadeIn(globals.fadeTime, function() {
            globals.currentScreen = 'lobby';
        });

        // Fix the indentation on lines that were drawn when the element was hidden
        chat.indentAll('lobby');

        // Automatically scroll to the bottom of the chat box
        let bottomPixel = $('#lobby-chat-text').prop('scrollHeight') - $('#lobby-chat-text').height();
        $('#lobby-chat-text').scrollTop(bottomPixel);

        // Focus the chat input
        $('#lobby-chat-box-input').focus();

        // Update the Racing+ Lua mod
        modLoader.reset();
    });
};

exports.raceDraw = function(race) {
    // Create the new row
    let raceDiv = '<tr id="lobby-current-races-' + race.id + '" class="';
    if (race.status === 'open' && race.ruleset.solo === false) {
        raceDiv += 'lobby-race-row-open ';
    }
    raceDiv += 'hidden">';

    // Column 1 - Name
    raceDiv += '<td id="lobby-current-races-' + race.id + '-name" class="lobby-current-races-name">';
    if (race.name === '-') {
        raceDiv += '<span lang="en">Race</span> ' + race.id;
    } else {
        raceDiv += misc.escapeHtml(race.name);
    }
    raceDiv += '</td>';

    // Column 2 - Status
    raceDiv += '<td class="lobby-current-races-status">';
    let circleClass;
    if (race.status === 'open') {
        circleClass = 'open';
    } else if (race.status === 'starting') {
        circleClass = 'starting';
    } else if (race.status === 'in progress') {
        circleClass = 'in-progress';
    }
    raceDiv += '<span id="lobby-current-races-' + race.id + '-status-circle" class="circle lobby-current-races-' + circleClass + '"></span>';
    raceDiv += ' &nbsp; <span id="lobby-current-races-' + race.id + '-status"><span lang="en">' + race.status.capitalize() + '</span></span>';
    raceDiv += '</td>';

    // Column 3 - Type
    raceDiv += '<td class="lobby-current-races-type">';
    raceDiv += '<span class="lobby-current-races-type-icon">';
    raceDiv += '<span class="lobby-current-races-' + race.ruleset.type + '" lang="en"></span></span>';
    raceDiv += '<span class="lobby-current-races-spacing"></span>';
    raceDiv += '<span lang="en">' + race.ruleset.type.capitalize() + '</span>';
    if (race.ruleset.solo) {
        raceDiv += ' (<span lang="en">Solo</span>)';
    }
    raceDiv += '</td>';

    // Column 4 - Format
    raceDiv += '<td class="lobby-current-races-format">';
    raceDiv += '<span class="lobby-current-races-format-icon">';
    raceDiv += '<span class="lobby-current-races-' + race.ruleset.format + '" lang="en"></span></span>';
    raceDiv += '<span class="lobby-current-races-spacing"></span>';
    let format = race.ruleset.format.capitalize();
    if (format === 'Unseeded-lite') {
        format = 'Unseeded';
    }
    raceDiv += '<span lang="en">' + format + '</span></td>';

    // Column 5 - Size
    raceDiv += '<td id="lobby-current-races-' + race.id + '-size" class="lobby-current-races-size">';
    // This will get filled in later by the "raceUpdatePlayers" function
    raceDiv += '</td>';

    // Column 6 - Entrants
    raceDiv += '<td id="lobby-current-races-' + race.id + '-racers" class="lobby-current-races-racers">';
    // This will get filled in later by the "raceUpdatePlayers" function
    raceDiv += '</td>';

    // Fix the bug where the "vertical-center" class causes things to be hidden if there is overflow
    if (Object.keys(globals.raceList).length > 4) { // More than 4 races causes the overflow
        $('#lobby-current-races-table-wrapper').removeClass('vertical-center');
    } else {
        $('#lobby-current-races-table-wrapper').addClass('vertical-center');
    }

    // Add it and fade it in
    $('#lobby-current-races-table-body').append(raceDiv);
    if ($('#lobby-current-races-table-no').css('display') !== 'none') {
        $('#lobby-current-races-table-no').fadeOut(globals.fadeTime, function() {
            $('#lobby-current-races-table').fadeIn(0);
            raceDraw2(race);
        });
    } else {
        raceDraw2(race);
    }
};

function raceDraw2(race) {
    // Fade in the race row
    $('#lobby-current-races-' + race.id).fadeIn(globals.fadeTime, function() {
        // While we were fading in, the race might have ended
        if (globals.raceList.hasOwnProperty(race.id) === false) {
            return;
        }

        // Make the row clickable
        if (globals.raceList[race.id].status === 'open' && globals.raceList[race.id].ruleset.solo === false) {
            $('#lobby-current-races-' + race.id).click(function() {
                if (globals.currentScreen === 'lobby') {
                    globals.currentScreen = 'waiting-for-server';
                    globals.conn.send('raceJoin', {
                        'id': race.id,
                    });
                }
            });
        }
    });

    // Now that it has begun to fade in, we can fill it
    raceDrawCheckForOverflow(race.id, 'name');

    // Update the players
    raceUpdatePlayers(race.id);
}

const raceUpdatePlayers = function(raceID) {
    // Draw the new size
    $('#lobby-current-races-' + raceID + '-size').html(globals.raceList[raceID].racers.length);

    // Draw the new racer list
    let racers = '';
    for (let racer of globals.raceList[raceID].racers) {
        if (racer === globals.raceList[raceID].captain) {
            racers += '<strong>' + racer + '</strong>, ';
        } else {
            racers += racer + ', ';
        }
    }
    racers = racers.slice(0, -2); // Chop off the trailing comma and space
    $('#lobby-current-races-' + raceID + '-racers').html(racers);

    // Check for overflow in the racer list
    raceDrawCheckForOverflow(raceID, 'racers');
};
exports.raceUpdatePlayers = raceUpdatePlayers;

// Make tooltips for long names if necessary
function raceDrawCheckForOverflow(raceID, target) {
    // Check to make sure that the race hasn't ended in the meantime
    if (typeof $('#lobby-current-races-' + raceID + '-' + target) === 'undefined') {
        let errorMessage = 'The "raceDrawCheckForOverflow" function was called for a race that does not exist anymore.';
        globals.log.info(errorMessage);

        try {
            throw new Error(errorMessage);
        } catch (err) {
            globals.Raven.captureException(err);
        }

        return;
    }

    // Race name column
    let shortened = false;
    let counter = 0; // It is possible to get stuck in the bottom while loop
    while ($('#lobby-current-races-' + raceID + '-' + target)[0].scrollWidth > $('#lobby-current-races-' + raceID + '-' + target).innerWidth()) {
        counter++;
        if (counter >= 1000) {
            // Something is weird and the page is not rendering properly
            break;
        }
        let shortenedName = $('#lobby-current-races-' + raceID + '-' + target).html().slice(0, -1);
        $('#lobby-current-races-' + raceID + '-' + target).html(shortenedName);
        shortened = true;
    }
    let content = '';
    if (target === 'name') {
        content = globals.raceList[raceID].name; // This does not need to be escaped because tooltipster displays HTML as plain text
    } else if (target === 'racers') {
        for (let racer of globals.raceList[raceID].racers) {
            content += racer + ', ';
        }
        content = content.slice(0, -2); // Chop off the trailing comma and space
    }
    if (shortened) {
        let shortenedName = $('#lobby-current-races-' + raceID + '-' + target).html().slice(0, -1); // Make it a bit shorter to account for the padding
        $('#lobby-current-races-' + raceID + '-' + target).html(shortenedName + '...');
        if ($('#lobby-current-races-' + raceID + '-' + target).hasClass('tooltipstered')) {
            $('#lobby-current-races-' + raceID + '-' + target).tooltipster('content', content);
        } else {
            $('#lobby-current-races-' + raceID + '-' + target).tooltipster({
                theme:   'tooltipster-shadow',
                delay:   0,
                content: content,
            });
        }
    } else {
        // Delete any existing tooltips, if they exist
        if ($('#lobby-current-races-' + raceID + '-' + target).hasClass('tooltipstered')) {
            $('#lobby-current-races-' + raceID + '-' + target).tooltipster('content', null);
        }
    }
}

exports.raceUndraw = function(raceID) {
    $('#lobby-current-races-' + raceID).fadeOut(globals.fadeTime, function() {
        $('#lobby-current-races-' + raceID).remove();

        if (Object.keys(globals.raceList).length === 0) {
            $('#lobby-current-races-table').fadeOut(0);
            $('#lobby-current-races-table-no').fadeIn(globals.fadeTime);
        }
    });

    // Fix the bug where the "vertical-center" class causes things to be hidden if there is overflow
    if (Object.keys(globals.raceList).length > 4) { // More than 4 races causes the overflow
        $('#lobby-current-races-table-wrapper').removeClass('vertical-center');
    } else {
        $('#lobby-current-races-table-wrapper').addClass('vertical-center');
    }
};

exports.usersDraw = function() {
    // Update the header that shows shows the amount of people online or in the race
    $('#lobby-users-online').html(globals.roomList.lobby.numUsers);

    // Make an array with the name of every user and alphabetize it
    let userList = [];
    for (let user in globals.roomList.lobby.users) {
        if (globals.roomList.lobby.users.hasOwnProperty(user)) {
            userList.push(user);
        }
    }

    // Case insensitive sort of the connected users
    userList.sort(function (a, b) {return a.toLowerCase().localeCompare(b.toLowerCase());});

    // Empty the existing list
    $('#lobby-users-users').html('');

    // Add a div for each player
    for (let i = 0; i < userList.length; i++) {
        if (userList[i] === globals.myUsername) {
            let userDiv = '<div>' + userList[i] + '</div>';
            $('#lobby-users-users').append(userDiv);
        } else {
            let userDiv = '<div id="lobby-users-' + userList[i] + '" class="users-user" data-tooltip-content="#user-click-tooltip">';
            userDiv += userList[i] + '</div>';
            $('#lobby-users-users').append(userDiv);

            // Add the tooltip (commented out since it doesn't work)
            /*$('#lobby-users-' + userList[i]).tooltipster({
                theme: 'tooltipster-shadow',
                trigger: 'click',
                interactive: true,
                side: 'left',
                functionBefore: userTooltipChange(userList[i]),
            });*/
        }
    }

    function userTooltipChange(username) {
        $('#user-click-profile').click(function() {
            let url = 'http' + (globals.secure ? 's' : '') + '://' + globals.domain + '/profile/' + username;
            shell.openExternal(url);
        });
        $('#user-click-private-message').click(function() {
            if (globals.currentScreen === 'lobby') {
                $('#lobby-chat-box-input').val('/msg ' + username + ' ');
                $('#lobby-chat-box-input').focus();
            } else if (globals.currentScreen === 'race') {
                $('#race-chat-box-input').val('/msg ' + username + ' ');
                $('#race-chat-box-input').focus();
            } else {
                misc.errorShow('Failed to fill in the chat box since currentScreen is "' + globals.currentScreen + '".');
            }
            misc.closeAllTooltips();
        });
    }
};
