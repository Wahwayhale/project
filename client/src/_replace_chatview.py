with open('E:/网页对话/project-master/client/src/App.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_block_start = "        ) : currentRoom ? ("
old_block_end = "        ) : bottomTab === 'chats' ? ("

# Find positions
start_pos = content.find(old_block_start)
end_pos = content.find(old_block_end, start_pos + 1)

if start_pos == -1 or end_pos == -1:
    print(f"Error: start={start_pos}, end={end_pos}")
else:
    print(f"Found block from position {start_pos} to {end_pos}")
    
    new_block = """        ) : currentRoom ? (
          <ChatView
            currentRoom={currentRoom}
            currentRoomId={currentRoomId}
            setCurrentRoom={setCurrentRoom}
            setCurrentRoomId={setCurrentRoomId}
            setMessages={setMessages}
            user={user}
            allUsers={allUsers}
            messages={messages}
            pinnedMessages={pinnedMessages}
            starredMessages={starredMessages}
            getReadInfo={getReadInfo}
            highlightText={highlightText}
            typingUser={typingUser}
            aiSummary={aiSummary}
            aiSummaryLoading={aiSummaryLoading}
            setAiSummary={setAiSummary}
            summarizeChat={summarizeChat}
            setShowImageGen={setShowImageGen}
            isSharingLocation={isSharingLocation}
            startSharingLocation={startSharingLocation}
            stopSharingLocation={stopSharingLocation}
            setShowCheckIn={setShowCheckIn}
            fetchCheckIns={fetchCheckIns}
            setShowMusicPanel={setShowMusicPanel}
            startCall={startCall}
            showSearch={showSearch}
            setShowSearch={setShowSearch}
            setShowRoomManage={setShowRoomManage}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            translations={translations}
            openImageViewer={openImageViewer}
            descLoading={descLoading}
            imageDesc={imageDesc}
            describeImage={describeImage}
            observeVideo={observeVideo}
            translatingMsg={translatingMsg}
            translateMessage={translateMessage}
            openLocationMap={openLocationMap}
            claimRedPacket={claimRedPacket}
            votePoll={votePoll}
            joinSolitaire={joinSolitaire}
            toggleReaction={toggleReaction}
            recallMessage={recallMessage}
            startEditMessage={startEditMessage}
            deleteMessage={deleteMessage}
            openReactionPicker={openReactionPicker}
            startReply={startReply}
            openForwardModal={openForwardModal}
            toggleStarMessage={toggleStarMessage}
            togglePinMessage={togglePinMessage}
            reactionPicker={reactionPicker}
            setReactionPicker={setReactionPicker}
            REACTION_EMOJIS={REACTION_EMOJIS}
            setMessageEndRef={setMessageEndRef}
            roomAnnouncements={roomAnnouncements}
            replyToMessage={replyToMessage}
            cancelReply={cancelReply}
            editingMessage={editingMessage}
            cancelEdit={cancelEdit}
            fileInputRef={fileInputRef}
            isRecording={isRecording}
            startRecording={startRecording}
            stopRecording={stopRecording}
            cancelRecording={cancelRecording}
            recordingTime={recordingTime}
            showEmojiPicker={showEmojiPicker}
            setShowEmojiPicker={setShowEmojiPicker}
            showMentionPicker={showMentionPicker}
            setShowMentionPicker={setShowMentionPicker}
            showQuickReplies={showQuickReplies}
            setShowQuickReplies={setShowQuickReplies}
            sendDice={sendDice}
            setShowGameModal={setShowGameModal}
            setShowRedPacketModal={setShowRedPacketModal}
            setShowPollModal={setShowPollModal}
            setShowSolitaireModal={setShowSolitaireModal}
            setShowMusicModal={setShowMusicModal}
            handleFileSelect={handleFileSelect}
            fetchSmartReplies={fetchSmartReplies}
            smartRepliesLoading={smartRepliesLoading}
            setPolishText={setPolishText}
            setPolishResult={setPolishResult}
            setShowPolishModal={setShowPolishModal}
            newMessage={newMessage}
            setNewMessage={setNewMessage}
            insertEmoji={insertEmoji}
            mentionFilter={mentionFilter}
            setMentionFilter={setMentionFilter}
            getFilteredMentionUsers={getFilteredMentionUsers}
            insertMention={insertMention}
            quickReplies={quickReplies}
            insertQuickReply={insertQuickReply}
            smartReplies={smartReplies}
            setSmartReplies={setSmartReplies}
            handleInputChange={handleInputChange}
            handleKeyDown={handleKeyDown}
            sendMessage={sendMessage}
          />
        ) : bottomTab === 'chats' ? ("""
    
    new_content = content[:start_pos] + new_block + content[end_pos + len(old_block_end):]
    
    with open('E:/网页对话/project-master/client/src/App.js', 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    print("Replacement done!")
