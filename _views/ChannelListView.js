/**
 This class...
 @class ChannelListView
 @constructor
 @param {String} i_container element that CompCampaignNavigator inserts itself into
 @return {Object} instantiated CompCampaignNavigator
 **/
define(['jquery', 'backbone', 'jqueryui', 'TouchPunch', 'Timeline', 'SequencerView'], function ($, Backbone, jqueryui, TouchPunch, Timeline, SequencerView) {

    BB.SERVICES.CHANNEL_LIST_VIEW = 'ChannelListView';

    var ChannelListView = BB.View.extend({

        /**
         Init the ChannelList component and enable sortable channels UI via drag and drop operations.
         @method _init
         @return none
         **/
        initialize: function () {
            var self = this;

            this.m_property = BB.comBroker.getService(BB.SERVICES.PROPERTIES_VIEW);
            this.selected_block_id = undefined;
            this.selected_campaign_timeline_chanel_id = undefined;
            this.selected_campaign_timeline_id = undefined;
            this.selected_campaign_timeline_board_viewer_id = undefined;

            $(Elements.SORTABLE).sortable();
            $(Elements.SORTABLE).disableSelection();
            $(Elements.SORTABLE).bind("sortstop", function (event, ui) {
                // $(Elements.SORTABLE).listview('refresh');
                self._reOrderChannelBlocks();
            });

            self._wireUI();
            self._listenTimelineSelected();
            self._listenResourceRemoved();
        },

        /**
         Wire the UI and listen to channel remove and channel add button events.
         @method _wireUI
         @return none
         **/
        _wireUI: function () {
            var self = this;
            $(Elements.CHANNEL_REMOVE_RESOURCE).on('click', function (e) {
                if (self.selected_block_id == undefined) {
                    alert('Please select a resource first and try again');
                    return;
                }
                self._deleteChannelBlock(self.selected_block_id);
            });

            $(Elements.CHANNEL_ADD_RESOURCE).on('click', function (e) {
                if (self.selected_campaign_timeline_id == undefined) {
                    alert('Please first select a channel to associate asset with');
                    return;
                }
                self._openAddBlockWizard(e);
            });
        },

        /**
         Update the blocks offset times according to current order of LI elements and reorder accordingly in msdb.
         @method _reOrderChannelBlocks
         @return none
         **/
        _reOrderChannelBlocks: function () {
            var self = this
            var blocks = $(Elements.SORTABLE).children();
            var playerOffsetTime = 0;

            $(blocks).each(function (i) {

                var block_id = $(this).data('block_id');
                var recBlock = jalapeno.getBlockRecord(block_id);
                var playerDuration = recBlock['player_duration']

                jalapeno.setBlockRecord(block_id, 'player_offset_time', playerOffsetTime);
                log('player ' + block_id + ' offset ' + playerOffsetTime + ' playerDuration ' + playerDuration);
                playerOffsetTime = parseFloat(playerOffsetTime) + parseFloat(playerDuration);
            });
            jalapeno.updateTimelineTotalDuration(this.selected_campaign_timeline_id);
        },

        /**
         Get the total duration in seconds of the channel
         @method _getTotalDurationChannel
         @return {Number} totalChannelLength
         **/
        _getTotalDurationChannel: function () {
            var self = this
            var blocks = $(Elements.SORTABLE).children();
            var blocksIDs = [];

            $(blocks).each(function (i) {
                var block_id = $(this).data('block_id');
                blocksIDs.push(block_id);
            });
            var totalChannelLength = jalapeno.getTotalDurationOfBlocks(blocksIDs);
            return totalChannelLength;
        },

        /**
         Launch the add new block wizard UI component.
         @method _openAddBlockWizard
         @return none
         **/
        _openAddBlockWizard: function (e) {
            var self = this;
            var addBlockWizard = new AddBlockWizard();
            addBlockWizard.newChannelBlockPage();
            BB.comBroker.listenOnce(AddBlockWizard.ADD_NEW_BLOCK, function (e) {
                self._createNewChannelBlock(e.edata.blockCode, e.edata.resourceID);
                addBlockWizard.destroy();
                addBlockWizard.close();
                e.stopImmediatePropagation();
                e.preventDefault();
            });
        },

        /**
         Create a new block (player) on the current channel and refresh UI bindings such as properties open events.
         @method _createNewChannelBlock
         @param {Number} i_blockID
         @param {Number} i_resourceID optional param used when creating a block with embedded resource (i.e.: video / image / swf)
         @return {Boolean} false
         **/
        _createNewChannelBlock: function (i_blockID, i_resourceID) {
            var self = this;

            var totalChannelLength = self._getTotalDurationChannel();
            var jData = jalapeno.createNewPlayer(self.selected_campaign_timeline_chanel_id, i_blockID, totalChannelLength, i_resourceID);
            var campaign_timeline_chanel_player_id = jData['campaign_timeline_chanel_player_id'];
            var campaign_timeline_chanel_player_data = jData['campaign_timeline_chanel_player_data'];

            var timeline = commBroker.getService('Campaign').getTimelineInstance(self.selected_campaign_timeline_id);
            var channel = timeline.getChannelInstance(self.selected_campaign_timeline_chanel_id);
            channel.createBlock(campaign_timeline_chanel_player_id, campaign_timeline_chanel_player_data)

            var campaign_timeline_board_viewer_id = self.selected_campaign_timeline_board_viewer_id;
            var campaign_timeline_id = self.selected_campaign_timeline_id;
            var campaign_timeline_chanel_id = self.selected_campaign_timeline_chanel_id;

            // self._resetChannel();
            $(Elements.SORTABLE).empty();
            self._loadChannelBlocks(campaign_timeline_id, campaign_timeline_chanel_id);
            self._listenBlockSelected();
            // self._deselectBlocksFromChannel();
            self._selectLastBlockOnChannel();
            return false;
        },

        /**
         Listen to when a resource has been deleted so we can delete the associated block and re calc channel length
         @method _listenResourceRemoved
         @return none
         **/
        _listenResourceRemoved: function () {
            var self = this;
            BB.comBroker.listen(BB.EVENTS.REMOVED_RESOURCE, function (e) {
                if (self.selected_campaign_timeline_id != undefined && self.selected_campaign_timeline_chanel_id != undefined) {
                    $(Elements.SORTABLE).empty();
                    self._loadChannelBlocks(self.selected_campaign_timeline_id, self.selected_campaign_timeline_chanel_id);
                    self._reOrderChannelBlocks();
                }
            });
        },

        /**
         Listen to the BB.EVENTS.ON_VIEWER_SELECTED so we know when a timeline has been selected.
         Once a timeline selection was done we check if the event if one of a timeline owner or other; if of timeline
         we populate channel list, if latter reset list.
         @method _listenTimelineSelected
         @return none
         **/
        _listenTimelineSelected: function () {
            var self = this;

            BB.comBroker.listen(BB.EVENTS.ON_VIEWER_SELECTED, function (e) {

                self._resetChannel();

                self.selected_campaign_timeline_board_viewer_id = e.caller.campaign_timeline_board_viewer_id;
                self.selected_campaign_timeline_id = e.caller.campaign_timeline_id;

                if (e.context.m_owner instanceof Timeline) {

                    var recCampaignTimelineViewerChanels = jalapeno.getChannelIdFromCampaignTimelineBoardViewer(self.selected_campaign_timeline_board_viewer_id, self.selected_campaign_timeline_id);
                    self._loadChannelBlocks(self.selected_campaign_timeline_id, recCampaignTimelineViewerChanels['campaign_timeline_chanel_id']);
                    $(Elements.CHANNEL_ADD_RESOURCE).fadeIn();
                    $(Elements.CHANNEL_REMOVE_RESOURCE).fadeIn();
                }

                if (e.context.m_owner instanceof SequencerView) {
                    self._resetChannel();
                    $(Elements.CHANNEL_ADD_RESOURCE).fadeOut();
                    $(Elements.CHANNEL_REMOVE_RESOURCE).fadeOut();
                }
            });
        },

        /**
         Load the channel list with its own blocks and refresh the UI.
         @method _loadChannelBlocks
         @param {Number} i_campaign_timeline_id
         @param {Number} i_campaign_timeline_chanel_id
         @return none
         **/
        _loadChannelBlocks: function (i_campaign_timeline_id, i_campaign_timeline_chanel_id) {
            var self = this;

            self.selected_campaign_timeline_chanel_id = i_campaign_timeline_chanel_id;

            var timeline = BB.comBroker.getService(BB.SERVICES.CAMPAIGN_VIEW).getTimelineInstance(i_campaign_timeline_id);
            var channel = timeline.getChannelInstance(i_campaign_timeline_chanel_id);
            var blocks = channel.getBlocks();

            for (var block_id in blocks) {
                var blockData = blocks[block_id].getBlockData();
                $(Elements.SORTABLE).append($('<li class="' + BB.lib.unclass(Elements.CLASS_CHANNEL_LIST_ITEMS) + '  list-group-item" data-block_id="' + blockData.blockID + '">' +
                    '<a href="#">' +
                    '<img  class="img-responsive" src="' + blockData.blockIcon + '"/>' +
                    '<span>' + blockData.blockName + '</span>' +
                    '</a>' +
                    '</li>'));
            }
            // '<a data-icon="gear" class="fixPropOpenLiButtonPosition selectedResource resourceOpenProperties"> </a>' +
            // $(Elements.SORTABLE).listview('refresh');
            self._listenBlockSelected();
        },

        /**
         Listen when a block is selected, if its properties need to be open than open panel.
         Also, reference the selected block internally and fire event announcing it was selected.
         @method _listenBlockSelected
         @return none
         **/
        _listenBlockSelected: function () {
            var self = this;

            $(Elements.CLASS_CHANNEL_LIST_ITEMS).on('click', function (e) {

                var resourceElem = $(e.target).closest('li');
                self.selected_block_id = $(resourceElem).data('block_id');
                self._blockChannelSelected();

                $(Elements.CLASS_CHANNEL_LIST_ITEMS).removeClass('activated').find('a').removeClass('whiteFont');
                $(resourceElem).addClass('activated').find('a').addClass('whiteFont');
                return false;
                /*
                 var openProps = $(e.target).closest('a').hasClass('resourceOpenProperties') ? true : false;
                 var resourceElem = $(e.target).closest('li');
                 var resourceProp = $(resourceElem).find('.resourceOpenProperties');
                 self.selected_block_id = $(resourceElem).data('block_id');
                 if (openProps)
                 BB.comBroker.getService(BB.SERVICES.PROPERTIES_VIEW).openPanel(e);
                 e.stopImmediatePropagation();
                 $(Elements.SORTABLE).listview('refresh');
                 */
            });
        },

        /**
         Fire event when block has been selected.
         @method _blockChannelSelected
         @return none
         **/
        _blockChannelSelected: function () {
            var self = this;
            BB.comBroker.fire(BB.EVENTS.BLOCK_ON_CHANNEL_SELECTED, this, null, self.selected_block_id);
        },

        /**
         Forget the selected channel and reset channel member references.@method _resetChannel
         @param {Number} i_playerData
         @return {Number} Unique clientId.
         **/
        _resetChannel: function () {
            var self = this;
            $(Elements.SORTABLE).empty();
            self.selected_block_id = undefined;
            self.selected_campaign_timeline_board_viewer_id = undefined;
            self.selected_campaign_timeline_id = undefined;
            self.selected_campaign_timeline_chanel_id = undefined;
        },

        /**
         Reset the UI when no block on channel is selected.
         @method _deselectBlocksFromChannel
         @return none
         **/
        _deselectBlocksFromChannel: function () {
            var self = this;
            self.selected_block_id = undefined;
            self.m_property.noPanel();
            $(Elements.SORTABLE).listview('refresh');
        },

        /**
         Listen to when a block length has changed so we can update all other blocks offset respectively
         @method listenBlockLengthChanged
         @return none
         **/
        listenBlockLengthChanged: function () {
            var self = this;
            commBroker.listen(Block.BLOCK_LENGTH_CHANGED, function (e) {
                self._reOrderChannelBlocks();
            });
        },

        /**
         Select the last block on the channel (last LI element) and fire a click event on it.
         @method _selectLastBlockOnChannel
         @return none
         **/
        _selectLastBlockOnChannel: function () {
            var self = this
            var blocks = $(Elements.SORTABLE).children();
            var block = undefined;
            $(blocks).each(function (i) {
                block = this;
            });
            if (block)
                $(block).click();
        },

        /**
         Delete the selected block from the channel.
         @method _deleteChannelBlock
         @return none
         **/
        _deleteChannelBlock: function (i_block_id) {
            var self = this;
            var selectedLI = $(Elements.SORTABLE).find('[data-block_id="' + i_block_id + '"]');
            selectedLI.remove();
            var timeline = commBroker.getService('Campaign').getTimelineInstance(self.selected_campaign_timeline_id);
            var channel = timeline.getChannelInstance(self.selected_campaign_timeline_chanel_id);
            channel.deleteBlock(i_block_id);
            // self.m_property.noPanel();
            // $(Elements.SORTABLE).listview('refresh');
            self._deselectBlocksFromChannel();
            self._reOrderChannelBlocks();
        }
    })

    return ChannelListView;

});